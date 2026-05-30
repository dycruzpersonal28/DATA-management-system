// app/api/finance/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // ── Fetch all financial entries in range ───────────────────────────────────
  const { data: entries, error } = await admin
    .from('financial_entries')
    .select('*')
    .eq('shop_id', shop_id)
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Filter out orphaned entries (receipt, payslip, journal) ──────────────
  const allEntries = entries || []

  // ── receipts ──────────────────────────────────────────────────────────────
  const receiptIds = [...new Set(
    allEntries.filter(e => e.reference_type === 'receipt' && e.reference_id).map(e => e.reference_id)
  )]
  let validReceiptIds = new Set<string>()
  if (receiptIds.length > 0) {
    const { data: existingReceipts } = await admin
      .from('receipts').select('id').in('id', receiptIds)
    validReceiptIds = new Set((existingReceipts || []).map(r => r.id))
  }

  // ── payslips ──────────────────────────────────────────────────────────────
  const payslipIds = [...new Set(
    allEntries.filter(e => e.reference_type === 'payslip' && e.reference_id).map(e => e.reference_id)
  )]
  let validPayslipIds = new Set<string>()
  if (payslipIds.length > 0) {
    const { data: existingPayslips } = await admin
      .from('payslips').select('id').in('id', payslipIds)
    validPayslipIds = new Set((existingPayslips || []).map(p => p.id))
  }

  // ── journal entries ───────────────────────────────────────────────────────
  const journalIds = [...new Set(
    allEntries.filter(e => e.reference_type === 'journal' && e.reference_id).map(e => e.reference_id)
  )]
  let validJournalIds = new Set<string>()
  if (journalIds.length > 0) {
    const { data: existingJournal } = await admin
      .from('journal_entries').select('id').in('id', journalIds)
    validJournalIds = new Set((existingJournal || []).map(j => j.id))
  }

  // Keep only entries whose source record still exists (or has no reference)
  const rows = allEntries.filter(e => {
    if (e.reference_type === 'receipt') return validReceiptIds.has(e.reference_id)
    if (e.reference_type === 'payslip') return validPayslipIds.has(e.reference_id)
    if (e.reference_type === 'journal') return validJournalIds.has(e.reference_id)
    return true // no reference_type — keep as-is
  })

  // ── Aggregate totals ───────────────────────────────────────────────────────
  let totalRevenue   = 0
  let totalCogs      = 0
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
    if ((e.type === 'expense' && e.category === 'payroll') || e.type === 'labor') totalPayroll  += amt
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
    if ((e.type === 'expense' && e.category === 'payroll') || e.type === 'labor') dailyMap[d].payroll  += amt
    if (e.type === 'expense' && e.category === 'discount') dailyMap[d].discount += amt
  }

  const daily = Object.values(dailyMap).map(d => ({
    ...d,
    net: d.revenue - d.cogs - d.payroll - d.discount,
  }))

  // ── Real-time labor accrual (clocked-in employees today) ──────────────────
  const today = new Date().toISOString().split('T')[0]
  let laborToday = 0

  if (to >= today) {
    // Use PHT (UTC+8) day boundaries to match kiosk clock-in timestamps
    const todayStartPHT = `${today}T00:00:00+08:00`
    const todayEndPHT   = `${today}T23:59:59+08:00`

    const { data: activeLogs } = await admin
      .from('time_logs')
      .select('employee_id, clock_in, clock_out, total_hours')
      .eq('shop_id', shop_id)
      .gte('clock_in', todayStartPHT)
      .lte('clock_in', todayEndPHT)
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
      totalCogs:               parseFloat(totalCogs.toFixed(2)),
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

  // Get all existing receipt IDs for this shop
  const receiptIds = [...new Set(orphans.map((o: any) => o.reference_id).filter(Boolean))]
  const { data: existingReceipts } = await admin
    .from('receipts')
    .select('id')
    .in('id', receiptIds)

  const existingIds = new Set((existingReceipts || []).map((r: any) => r.id))
  const orphanIds = orphans
    .filter((o: any) => !existingIds.has(o.reference_id))
    .map((o: any) => o.id)

  if (orphanIds.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const { error: delError } = await admin
    .from('financial_entries')
    .delete()
    .in('id', orphanIds)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  return NextResponse.json({ deleted: orphanIds.length })
}