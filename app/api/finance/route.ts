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

  const rows = entries || []

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