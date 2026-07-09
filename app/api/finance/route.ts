// app/api/finance/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helper: current date in shop's timezone ─────────────────────────────────
function getShopDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

// GET /api/finance?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { shop_id } = appUser
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to dates required' }, { status: 400 })
  }

  // ── Fetch shop settings (COGS toggle) ─────────────────────────────────────
  const { data: shopRow } = await admin
    .from('shops')
    .select('feature_auto_cogs, timezone')
    .eq('id', shop_id)
    .single()
  const autoCogsEnabled = shopRow?.feature_auto_cogs !== false
  const shopTimezone    = shopRow?.timezone ?? 'Asia/Manila'

  // ── Fetch all financial entries in range ───────────────────────────────────
  const { data: entries, error } = await admin
    .from('financial_entries')
    .select('*')
    .eq('shop_id', shop_id)
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Filter out orphaned + voided receipt entries in JS ────────────────────
  const allEntries = entries || []
  const receiptLinkedEntries = allEntries.filter(e => e.reference_type === 'receipt' && e.reference_id)
  const receiptIds = [...new Set(receiptLinkedEntries.map(e => e.reference_id))]

  // Fetch receipts that exist AND are not voided
  let validReceiptIds = new Set<string>()
  if (receiptIds.length > 0) {
    const { data: existingReceipts } = await admin
      .from('receipts')
      .select('id, status')
      .in('id', receiptIds)
    // Only include completed receipts — exclude voided ones
    validReceiptIds = new Set(
      (existingReceipts || [])
        .filter(r => r.status !== 'voided')
        .map(r => r.id)
    )
  }

  // All valid (non-orphaned, non-voided) entries — used for display COGS
  const allValidRows = allEntries.filter(e => {
    if (e.reference_type !== 'receipt') return true
    return validReceiptIds.has(e.reference_id)
  })

  // Keep entries where:
  // 1. Not receipt-linked (manual journal entries always shown)
  // 2. Receipt exists and is not voided
  // 3. If COGS toggle is OFF, exclude cogs type entries from P&L calculation
  const rows = allValidRows.filter(e => {
    if (!autoCogsEnabled && e.type === 'cogs') return false
    return true
  })

  // ── Always compute real COGS for display (regardless of toggle) ───────────
  let totalCogsDisplay = 0
  for (const e of allValidRows) {
    if (e.type === 'cogs') totalCogsDisplay += Number(e.amount)
  }

  // ── Aggregate totals (COGS excluded from rows when toggle is OFF) ──────────
  let totalRevenue   = 0
  let totalCogs      = 0   // used only for P&L math
  let totalPayroll   = 0
  let totalDiscount  = 0
  let totalTax       = 0
  let totalOtherIncome        = 0
  let totalOperatingExpenses  = 0

  for (const e of rows) {
    const amt = Number(e.amount)
    if (e.type === 'revenue' && e.category === 'sales')    totalRevenue  += amt
    if (e.type === 'revenue' && e.category === 'tax')      totalTax      += amt
    if (e.type === 'cogs')                                 totalCogs     += amt
    if (e.type === 'expense' && e.category === 'payroll') totalPayroll  += amt
    if (e.type === 'expense' && e.category === 'discount') totalDiscount += amt
    if (e.type === 'other_income')                         totalOtherIncome       += amt
    if (e.type === 'expense' && e.category !== 'payroll' && e.category !== 'discount') totalOperatingExpenses += amt
  }

  const grossProfit  = totalRevenue + totalOtherIncome - totalCogs
  const netProfit    = grossProfit - totalPayroll - totalDiscount - totalOperatingExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // ── Daily breakdown ────────────────────────────────────────────────────────
  const dailyMap: Record<string, {
    date: string
    revenue: number
    cogs: number
    payroll: number
    discount: number
    net: number
  }> = {}

  for (const e of rows) {
    const d = e.entry_date
    if (!dailyMap[d]) {
      dailyMap[d] = { date: d, revenue: 0, cogs: 0, payroll: 0, discount: 0, net: 0 }
    }
    const amt = Number(e.amount)
    if (e.type === 'revenue' && e.category === 'sales')    dailyMap[d].revenue  += amt
    if (e.type === 'cogs')                                 dailyMap[d].cogs     += amt
    if (e.type === 'expense' && e.category === 'payroll') dailyMap[d].payroll  += amt
    if (e.type === 'expense' && e.category === 'discount') dailyMap[d].discount += amt
  }

  const daily = Object.values(dailyMap).map(d => ({
    ...d,
    net: d.revenue - (autoCogsEnabled ? d.cogs : 0) - d.payroll - d.discount,
  }))

  // ── Real-time labor accrual (clocked-in employees today) ──────────────────
  const today = getShopDate(shopTimezone)
  let laborToday = 0

  if (to >= today) {
    const { data: activeLogs } = await admin
      .from('time_logs')
      .select('employee_id, clock_in, clock_out, total_hours')
      .eq('shop_id', shop_id)
      .eq('date', today)
      .order('clock_in', { ascending: false })

    // Fetch employee rates separately to avoid FK join ambiguity
    const employeeIds = [...new Set((activeLogs || []).map((l: any) => l.employee_id))]
    const { data: empRates } = employeeIds.length > 0
      ? await admin.from('employees').select('id, hourly_rate').in('id', employeeIds)
      : { data: [] }

    const rateMap: Record<string, number> = Object.fromEntries(
      (empRates || []).map((e: any) => [e.id, Number(e.hourly_rate ?? 0)])
    )

    for (const log of activeLogs || []) {
      const rate = rateMap[log.employee_id] ?? 0
      if (rate === 0) continue

      if (log.clock_out) {
        // Completed shift — use total_hours (generated column)
        laborToday += Number(log.total_hours ?? 0) * rate
      } else {
        // Still clocked in — accrue from clock_in to now
        const elapsed = (Date.now() - new Date(log.clock_in).getTime()) / 3_600_000
        laborToday += elapsed * rate
      }
    }
  }

  return NextResponse.json({
    summary: {
      totalRevenue:            parseFloat(totalRevenue.toFixed(2)),
      totalOtherIncome:        parseFloat(totalOtherIncome.toFixed(2)),
      totalCogs:               parseFloat(totalCogsDisplay.toFixed(2)),
      autoCogsEnabled,
      totalPayroll:            parseFloat(totalPayroll.toFixed(2)),
      totalDiscount:           parseFloat(totalDiscount.toFixed(2)),
      totalTax:                parseFloat(totalTax.toFixed(2)),
      totalOperatingExpenses:  parseFloat(totalOperatingExpenses.toFixed(2)),
      grossProfit:             parseFloat(grossProfit.toFixed(2)),
      netProfit:               parseFloat(netProfit.toFixed(2)),
      profitMargin:            parseFloat(profitMargin.toFixed(1)),
      laborToday:              parseFloat(laborToday.toFixed(2)),
    },
    daily,
    entries: rows,
  })
}

// DELETE /api/finance/cleanup
// Removes financial_entries whose linked receipt no longer exists
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { shop_id } = appUser

  // Find all receipt-linked financial entry IDs where receipt is gone
  const { data: orphans } = await admin
    .from('financial_entries')
    .select('id, reference_id')
    .eq('shop_id', shop_id)
    .eq('reference_type', 'receipt')

  if (!orphans || orphans.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // Get all existing, non-voided receipt IDs for this shop
  const receiptIds = [...new Set(orphans.map((o: any) => o.reference_id).filter(Boolean))]
  const { data: existingReceipts } = await admin
    .from('receipts')
    .select('id, status')
    .in('id', receiptIds)

  // Treat voided receipts the same as deleted — their entries should be cleaned up
  const existingIds = new Set(
    (existingReceipts || [])
      .filter((r: any) => r.status !== 'voided')
      .map((r: any) => r.id)
  )
  const orphanIds = orphans
    .filter((o: any) => !existingIds.has(o.reference_id))
    .map((o: any) => o.id)

  // ── Also clean up orphaned labor entries (time_log deleted from DB) ──────
  const { data: laborEntries } = await admin
    .from('financial_entries')
    .select('id, reference_id')
    .eq('shop_id', shop_id)
    .eq('reference_type', 'time_log')

  let orphanLaborIds: string[] = []
  if (laborEntries && laborEntries.length > 0) {
    const timeLogIds = [...new Set(laborEntries.map((e: any) => e.reference_id).filter(Boolean))]
    const { data: existingTimeLogs } = await admin
      .from('time_logs')
      .select('id')
      .in('id', timeLogIds)

    const existingTimeLogIds = new Set((existingTimeLogs || []).map((t: any) => t.id))
    orphanLaborIds = laborEntries
      .filter((e: any) => !existingTimeLogIds.has(e.reference_id))
      .map((e: any) => e.id)

    if (orphanLaborIds.length > 0) {
      await admin.from('financial_entries').delete().in('id', orphanLaborIds)
    }
  }

  // ── Delete orphaned receipt entries ───────────────────────────────────────
  if (orphanIds.length > 0) {
    const { error: delError } = await admin
      .from('financial_entries')
      .delete()
      .in('id', orphanIds)

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  const totalDeleted = orphanIds.length + orphanLaborIds.length
  return NextResponse.json({ deleted: totalDeleted })
}
