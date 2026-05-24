import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

type Params = {
  from: string
  to: string
  groupBy: 'day' | 'week' | 'month'
}

type SummaryData = {
  grossSales: number
  refunds: number
  discounts: number
  netSales: number
  costOfGoods: number
  grossProfit: number
  transactions: number
  avgSale: number
}

type ChartPoint = {
  date: string
  grossSales: number
  netSales: number
}

type TopItem = {
  itemName: string
  unitsSold: number
  revenue: number
  numOrders: number
}

// ─── Helper: format date label for chart ───────────────────────────────────────
function formatDateLabel(dateStr: string, groupBy: 'day' | 'week' | 'month') {
  const d = new Date(dateStr)
  if (groupBy === 'month') return d.toLocaleString('default', { month: 'short', year: '2-digit' })
  if (groupBy === 'week') return `W${getWeekNumber(d)}`
  return d.toLocaleString('default', { month: 'short', day: 'numeric' })
}

function getWeekNumber(d: Date) {
  const oneJan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
}

// ─── Fetch all report data ──────────────────────────────────────────────────────
async function fetchReportsData({ from, to, groupBy }: Params) {
  const supabase = createClient()

  // 1. Get the shop_id for the current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!shop) throw new Error('No shop found')

  const shopId = shop.id

  // 2. Fetch completed receipts in date range
  const { data: receipts, error: receiptError } = await supabase
    .from('receipts')
    .select('id, total, discount_amount, tax_amount, refund_amount, created_at, status')
    .eq('shop_id', shopId)
    .eq('status', 'completed')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: true })

  if (receiptError) throw receiptError

  const receiptsData = receipts ?? []

  // 3. Compute summary KPIs
  const grossSales = receiptsData.reduce((sum, r) => sum + (r.total ?? 0), 0)
  const refunds = receiptsData.reduce((sum, r) => sum + (r.refund_amount ?? 0), 0)
  const discounts = receiptsData.reduce((sum, r) => sum + (r.discount_amount ?? 0), 0)
  const netSales = grossSales - refunds - discounts
  const transactions = receiptsData.length
  const avgSale = transactions > 0 ? grossSales / transactions : 0

  const summary: SummaryData = {
    grossSales,
    refunds,
    discounts,
    netSales,
    costOfGoods: 0,   // requires COGS tracking — set up in Phase 6
    grossProfit: netSales,
    transactions,
    avgSale,
  }

  // 4. Group by day/week/month for chart
  const grouped: Record<string, { grossSales: number; netSales: number }> = {}
  for (const r of receiptsData) {
    const d = new Date(r.created_at)
    let key: string
    if (groupBy === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    } else if (groupBy === 'week') {
      // Group by start of ISO week
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff))
      key = monday.toISOString().split('T')[0]
    } else {
      key = r.created_at.split('T')[0]
    }

    if (!grouped[key]) grouped[key] = { grossSales: 0, netSales: 0 }
    grouped[key].grossSales += r.total ?? 0
    grouped[key].netSales += (r.total ?? 0) - (r.refund_amount ?? 0) - (r.discount_amount ?? 0)
  }

  const chartData: ChartPoint[] = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: formatDateLabel(date, groupBy),
      ...values,
    }))

  // 5. Fetch top items
  const receiptIds = receiptsData.map((r) => r.id)
  let topItems: TopItem[] = []

  if (receiptIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('receipt_items')
      .select('item_name, quantity, line_total, receipt_id')
      .in('receipt_id', receiptIds)

    if (itemsError) throw itemsError

    const itemMap: Record<string, TopItem> = {}
    for (const row of items ?? []) {
      if (!itemMap[row.item_name]) {
        itemMap[row.item_name] = {
          itemName: row.item_name,
          unitsSold: 0,
          revenue: 0,
          numOrders: 0,
        }
      }
      itemMap[row.item_name].unitsSold += row.quantity ?? 0
      itemMap[row.item_name].revenue += row.line_total ?? 0
      itemMap[row.item_name].numOrders += 1
    }

    topItems = Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }

  return { summary, chartData, topItems }
}

// ─── Hook ───────────────────────────────────────────────────────────────────────
export function useReportsData(params: Params) {
  const query = useQuery({
    queryKey: ['reports', params.from, params.to, params.groupBy],
    queryFn: () => fetchReportsData(params),
    staleTime: 1000 * 60 * 5, // 5 min cache
  })

  return {
    summary: query.data?.summary,
    chartData: query.data?.chartData ?? [],
    topItems: query.data?.topItems ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
