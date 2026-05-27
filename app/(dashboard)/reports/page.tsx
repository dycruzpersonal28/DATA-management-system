'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useShop } from '@/lib/hooks/useShop'
import { DateRangeFilter } from '@/components/reports/DateRangeFilter'
import {
  TrendingUp, DollarSign, ArrowDownCircle, ArrowUpCircle,
  Receipt, Ban, ShoppingBag, BarChart2, RefreshCw,
  Printer, Edit2,
} from 'lucide-react'
import { useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type DateRange = {
  from: string
  to: string
  label: string
}

type UnifiedTx = {
  id: string
  _type: 'sale' | 'refund' | 'cash_in' | 'cash_out'
  _time: Date
  _ref: string
  _staff: string
  total?: number
  amount?: number
  note?: string
  void_note?: string
  payment_types?: { name: string }
  shift_id?: string
  // receipt items filled separately
  _items?: { quantity: number; item_name: string; line_total: number }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────
const PRESETS: DateRange[] = [
  {
    label: 'Today',
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 7 days',
    from: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 30 days',
    from: new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'This month',
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Ref number helper (mirrors shift report)
// ─────────────────────────────────────────────────────────────────────────────
function buildRefNumber(date: Date, sequence: number): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const y = String(date.getFullYear())
  return `${m}${d}${y}-${String(sequence).padStart(5, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, bg, text, isLoading, prefix = '',
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; bg: string; text: string
  isLoading: boolean; prefix?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {isLoading
          ? <div className="h-6 w-20 bg-gray-100 rounded animate-pulse mt-1" />
          : <p className={`text-lg font-bold ${text} leading-tight`}>{prefix}{value}</p>
        }
        {sub && !isLoading && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Type badge (mirrors shift report badges)
// ─────────────────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: UnifiedTx['_type'] }) {
  if (type === 'sale')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium whitespace-nowrap">
        <Receipt className="w-2.5 h-2.5" /> Sale
      </span>
    )
  if (type === 'refund')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-medium whitespace-nowrap">
        <Ban className="w-2.5 h-2.5" /> Refund
      </span>
    )
  if (type === 'cash_in')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium whitespace-nowrap">
        <ArrowDownCircle className="w-2.5 h-2.5" /> Cash In
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium whitespace-nowrap">
      <ArrowUpCircle className="w-2.5 h-2.5" /> Cash Out
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createClient()
  const { currencySymbol } = useShop()

  const [dateRange, setDateRange] = useState<DateRange>(PRESETS[2])
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [isLoading, setIsLoading] = useState(true)

  // Raw data
  const [receipts, setReceipts] = useState<any[]>([])
  const [cashMovements, setCashMovements] = useState<any[]>([])
  const [receiptItems, setReceiptItems] = useState<Record<string, any[]>>({})

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true)

    // date range: inclusive — pad 'to' to end of day
    const fromTs = `${dateRange.from}T00:00:00`
    const toTs   = `${dateRange.to}T23:59:59`

    const [receiptsRes, movementsRes] = await Promise.all([
      supabase
        .from('receipts')
        .select('*, app_users:employee_id(name), payment_types(name), shifts!inner(app_users(name))')
        .gte('created_at', fromTs)
        .lte('created_at', toTs)
        .order('created_at'),
      supabase
        .from('shift_cash_movements')
        .select('*, shifts!inner(app_users(name))')
        .gte('created_at', fromTs)
        .lte('created_at', toTs)
        .order('created_at'),
    ])

    const rxs = receiptsRes.data || []
    const mvs = movementsRes.data || []
    setReceipts(rxs)
    setCashMovements(mvs)

    // Fetch receipt items in one batch
    if (rxs.length > 0) {
      const { data: items } = await supabase
        .from('receipt_items')
        .select('*')
        .in('receipt_id', rxs.map((r: any) => r.id))

      const byReceipt: Record<string, any[]> = {}
      for (const item of items || []) {
        if (!byReceipt[item.receipt_id]) byReceipt[item.receipt_id] = []
        byReceipt[item.receipt_id].push(item)
      }
      setReceiptItems(byReceipt)
    } else {
      setReceiptItems({})
    }

    setIsLoading(false)
  }, [dateRange.from, dateRange.to])

  useEffect(() => { loadData() }, [loadData])

  // ── Derived summaries ──────────────────────────────────────────────────────
  const activeReceipts = useMemo(() => receipts.filter(r => r.status !== 'voided'), [receipts])
  const voidedReceipts = useMemo(() => receipts.filter(r => r.status === 'voided'), [receipts])

  const grossSales   = useMemo(() => activeReceipts.reduce((s, r) => s + Number(r.total), 0), [activeReceipts])
  const refundTotal  = useMemo(() => voidedReceipts.reduce((s, r) => s + Number(r.total), 0), [voidedReceipts])
  const netSales     = grossSales - refundTotal

  const cashInTotal  = useMemo(() => cashMovements.filter(m => m.type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0), [cashMovements])
  const cashOutTotal = useMemo(() => cashMovements.filter(m => m.type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0), [cashMovements])

  const totalTxCount = activeReceipts.length
  const avgSale      = totalTxCount > 0 ? netSales / totalTxCount : 0

  // ── Unified transaction timeline ──────────────────────────────────────────
  const allTransactions = useMemo<UnifiedTx[]>(() => {
    const sorted = [...receipts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const refMap: Record<string, string> = {}
    sorted.forEach((r, idx) => { refMap[r.id] = buildRefNumber(new Date(r.created_at), idx + 1) })

    return [
      ...receipts.map(r => ({
        ...r,
        _type: (r.status === 'voided' ? 'refund' : 'sale') as UnifiedTx['_type'],
        _time: new Date(r.created_at),
        _ref: refMap[r.id] || '—',
        _staff: r.app_users?.name || r.shifts?.app_users?.name || '—',
        _items: receiptItems[r.id] || [],
      })),
      ...cashMovements.map(m => ({
        ...m,
        _type: m.type as UnifiedTx['_type'],
        _time: new Date(m.created_at),
        _ref: '—',
        _staff: m.shifts?.app_users?.name || '—',
        _items: [],
      })),
    ].sort((a, b) => a._time.getTime() - b._time.getTime())
  }, [receipts, cashMovements, receiptItems])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 space-y-5">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sales Report</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {dateRange.label} · {dateRange.from} → {dateRange.to}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 rounded-xl border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <DateRangeFilter
              presets={PRESETS}
              selected={dateRange}
              onSelect={setDateRange}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          </div>
        </div>

        {/* ── KPI Summary Grid ────────────────────────────────────────────── */}
        {/* 2-col on mobile/tablet, 5-col on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            label="Gross Sales"
            value={`${currencySymbol}${grossSales.toFixed(2)}`}
            sub={`${activeReceipts.length} sale${activeReceipts.length !== 1 ? 's' : ''}`}
            icon={TrendingUp}
            bg="bg-indigo-50" text="text-indigo-600"
            isLoading={isLoading}
          />
          <KpiCard
            label="Net Sales"
            value={`${currencySymbol}${netSales.toFixed(2)}`}
            sub={refundTotal > 0 ? `−${currencySymbol}${refundTotal.toFixed(2)} refunded` : 'No refunds'}
            icon={DollarSign}
            bg="bg-emerald-50" text="text-emerald-600"
            isLoading={isLoading}
          />
          <KpiCard
            label="Cash Out (Expenses)"
            value={`${currencySymbol}${cashOutTotal.toFixed(2)}`}
            sub={`${cashMovements.filter(m => m.type === 'cash_out').length} movement(s)`}
            icon={ArrowUpCircle}
            bg="bg-orange-50" text="text-orange-600"
            isLoading={isLoading}
          />
          <KpiCard
            label="Transactions"
            value={String(totalTxCount)}
            sub={`${voidedReceipts.length} voided · ${cashMovements.length} cash moves`}
            icon={Receipt}
            bg="bg-violet-50" text="text-violet-600"
            isLoading={isLoading}
          />
          <KpiCard
            label="Avg. Sale"
            value={`${currencySymbol}${avgSale.toFixed(2)}`}
            sub="per active transaction"
            icon={BarChart2}
            bg="bg-sky-50" text="text-sky-600"
            isLoading={isLoading}
          />
        </div>

        {/* ── Transactions Table ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* Table toolbar */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-800">All Transactions</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
              {allTransactions.length} entries
            </span>
          </div>

          {/* Scrollable table — frozen header, horizontal scroll on tablet */}
          <div className="overflow-auto" style={{ maxHeight: '520px' }}>
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {/* sticky top + left-align headers */}
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200">
                    Date &amp; Time
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200">
                    Ref #
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200">
                    Type
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200">
                    Items / Note
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200 hidden sm:table-cell">
                    Payment
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200 hidden md:table-cell">
                    Staff
                  </th>
                  <th className="sticky top-0 z-20 bg-gray-50 text-right px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                {isLoading && (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}

                {!isLoading && allTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-gray-400">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No transactions in this date range
                    </td>
                  </tr>
                )}

                {!isLoading && allTransactions.map((tx) => {
                  const isSale    = tx._type === 'sale'
                  const isRefund  = tx._type === 'refund'
                  const isCashIn  = tx._type === 'cash_in'
                  const isPositive = isSale || isCashIn
                  const amountValue = Number(tx.total ?? tx.amount ?? 0)

                  return (
                    <tr
                      key={`${tx._type}-${tx.id}`}
                      className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                        <div className="font-medium text-gray-700">
                          {tx._time.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="text-gray-400 text-[10px]">
                          {tx._time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Ref # */}
                      <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">
                        {tx._ref}
                      </td>

                      {/* Type badge */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <TypeBadge type={tx._type} />
                      </td>

                      {/* Items / Note */}
                      <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                        {(isSale || isRefund) ? (
                          <div className="space-y-0.5">
                            {(tx._items || []).map((it, j) => (
                              <div key={j} className="truncate text-gray-700">
                                {it.quantity}× {it.item_name}
                              </div>
                            ))}
                            {tx.note && (
                              <div className="text-amber-600 truncate text-[10px]">📝 {tx.note}</div>
                            )}
                            {isRefund && (tx as any).void_note && (
                              <div className="text-red-400 truncate text-[10px]">{(tx as any).void_note}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">{tx.note || '—'}</span>
                        )}
                      </td>

                      {/* Payment method — hidden on mobile */}
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap hidden sm:table-cell">
                        {(isSale || isRefund)
                          ? (tx as any).payment_types?.name || 'Cash'
                          : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* Staff — hidden on tablet portrait */}
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap hidden md:table-cell">
                        {tx._staff}
                      </td>

                      {/* Amount */}
                      <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : '−'}{currencySymbol}{amountValue.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Sticky totals footer */}
              {!isLoading && allTransactions.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                    <td colSpan={6} className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-right">
                      Net Sales Total
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-700">
                      {currencySymbol}{netSales.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
