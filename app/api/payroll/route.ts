// /app/api/payroll/route.ts

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET /api/payroll ─────────────────────────────────────────────────────────
// Fetch all payroll periods (with payslip counts) OR payslips for a specific period
//
// ?period_id=xxx   → returns payslips for that period with employee details
// (no params)      → returns list of all payroll_periods for this shop
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Identify shop from session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser, error: appUserError } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (appUserError || !appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { shop_id } = appUser
  const { searchParams } = new URL(req.url)
  const period_id = searchParams.get('period_id')

  // ── Return payslips for a specific period ──────────────────────────────────
  if (period_id) {
    const { data: payslips, error } = await admin
      .from('payslips')
      .select(`
        *,
        employees (
          id, name, email, employee_no, employment_type,
          hourly_rate, allowance,
          sss_no, philhealth_no, pagibig_no,
          role
        )
      `)
      .eq('shop_id', shop_id)
      .eq('period_id', period_id)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payslips })
  }

  // ── Return all payroll periods ─────────────────────────────────────────────
  const { data: periods, error } = await admin
    .from('payroll_periods')
    .select('*')
    .eq('shop_id', shop_id)
    .order('period_start', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach payslip count + total net_pay per period
  const enriched = await Promise.all(
    (periods || []).map(async (period) => {
      const { data: slips } = await admin
        .from('payslips')
        .select('id, net_pay, status')
        .eq('period_id', period.id)

      return {
        ...period,
        payslip_count: slips?.length ?? 0,
        total_net_pay: slips?.reduce((sum, s) => sum + (s.net_pay ?? 0), 0) ?? 0,
        finalized_count: slips?.filter(s => s.status === 'finalized').length ?? 0,
      }
    })
  )

  return NextResponse.json({ periods: enriched })
}

// ─── POST /api/payroll ────────────────────────────────────────────────────────
// Two actions depending on body:
//
// action: 'create_period'   → create a new payroll_period + auto-generate draft payslips
// action: 'finalize_period' → set all payslips in a period to 'finalized'
// action: 'update_payslip'  → update a single payslip's fields (admin override)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
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

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { shop_id } = appUser
  const body = await req.json()
  const { action } = body

  // ── CREATE PERIOD + GENERATE DRAFT PAYSLIPS ────────────────────────────────
  if (action === 'create_period') {
    const { period_start, period_end } = body

    if (!period_start || !period_end) {
      return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 })
    }

    // Derive cutoff from start date — DB only accepts '1st' or '15th'
    const startDay = new Date(period_start).getUTCDate()
    const cutoff = startDay <= 14 ? '1st' : '15th'

    // Create the period
    const { data: period, error: periodError } = await admin
      .from('payroll_periods')
      .insert({
        shop_id,
        period_start,
        period_end,
        cutoff,
        status: 'draft',
      })
      .select()
      .single()

    if (periodError) {
      return NextResponse.json({ error: periodError.message }, { status: 500 })
    }

    // Fetch all active employees for this shop
    const { data: employees, error: empError } = await admin
      .from('employees')
      .select('id, name, employee_no, role, hourly_rate, allowance, employment_type, sss_no, philhealth_no, pagibig_no')
      .eq('shop_id', shop_id)
      .eq('is_active', true)

    if (empError || !employees?.length) {
      return NextResponse.json({
        period,
        payslips: [],
        message: 'Period created but no active employees found',
      })
    }

    // Fetch time_logs in range for each employee
    const { data: timeLogs, error: tlError } = await admin
      .from('time_logs')
      .select('employee_id, total_hours, overtime_hours, late_minutes')
      .eq('shop_id', shop_id)
      .gte('date', period_start)
      .lte('date', period_end)
      .not('clock_out', 'is', null)  // only completed shifts

    if (tlError) {
      return NextResponse.json({ error: tlError.message }, { status: 500 })
    }

    // Aggregate hours per employee
    const logsByEmployee: Record<string, {
      total_hours: number
      overtime_hours: number
      late_minutes: number
    }> = {}

    for (const log of timeLogs ?? []) {
      if (!logsByEmployee[log.employee_id]) {
        logsByEmployee[log.employee_id] = {
          total_hours: 0,
          overtime_hours: 0,
          late_minutes: 0,
        }
      }
      logsByEmployee[log.employee_id].total_hours += log.total_hours ?? 0
      logsByEmployee[log.employee_id].overtime_hours += log.overtime_hours ?? 0
      logsByEmployee[log.employee_id].late_minutes += log.late_minutes ?? 0
    }

    // Build payslips
    const payslipInserts = employees.map((emp) => {
      const logs = logsByEmployee[emp.id] ?? {
        total_hours: 0,
        overtime_hours: 0,
        late_minutes: 0,
      }

      const hourlyRate = emp.hourly_rate ?? 0
      const allowance = emp.allowance ?? 0

      const basic_pay = logs.total_hours * hourlyRate
      const overtime_pay = logs.overtime_hours * (hourlyRate * 1.25)
      const late_deduction = (logs.late_minutes / 60) * hourlyRate

      // Philippine statutory deductions (semi-monthly approximations)
      // These are defaults — admin can override per payslip
      const monthly_basic = basic_pay * 2  // rough monthly estimate
      const sss_contribution = Math.min(monthly_basic * 0.045, 900) / 2
      const philhealth_contribution = (monthly_basic * 0.025) / 2
      const pagibig_contribution = 100 / 2  // ₱100/month flat → ₱50 semi-monthly

      const gross_pay = basic_pay + overtime_pay + allowance
      const total_deductions = late_deduction + sss_contribution + philhealth_contribution + pagibig_contribution
      const net_pay = gross_pay - total_deductions

      return {
        shop_id,
        employee_id: emp.id,
        period_id: period.id,
        basic_pay: parseFloat(basic_pay.toFixed(2)),
        overtime_pay: parseFloat(overtime_pay.toFixed(2)),
        allowance: parseFloat(allowance.toFixed(2)),
        late_deduction: parseFloat(late_deduction.toFixed(2)),
        sss_contribution: parseFloat(sss_contribution.toFixed(2)),
        philhealth_contribution: parseFloat(philhealth_contribution.toFixed(2)),
        pagibig_contribution: parseFloat(pagibig_contribution.toFixed(2)),
        tax_withheld: 0,
        net_pay: parseFloat(net_pay.toFixed(2)),
        status: 'draft',
        // ── Attendance snapshot (frozen at generation time) ──────────────────
        total_hours:    parseFloat(logs.total_hours.toFixed(2)),
        overtime_hours: parseFloat(logs.overtime_hours.toFixed(2)),
        late_minutes:   logs.late_minutes,
        // ── Employee info snapshot (survives future profile changes) ─────────
        snapshot_name:            emp.name,
        snapshot_employee_no:     emp.employee_no    ?? null,
        snapshot_role:            emp.role           ?? null,
        snapshot_employment_type: emp.employment_type ?? null,
        snapshot_sss_no:          emp.sss_no         ?? null,
        snapshot_philhealth_no:   emp.philhealth_no  ?? null,
        snapshot_pagibig_no:      emp.pagibig_no     ?? null,
      }
    })

    const { data: payslips, error: insertError } = await admin
      .from('payslips')
      .insert(payslipInserts)
      .select()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ period, payslips })
  }

  // ── FINALIZE PERIOD ────────────────────────────────────────────────────────
  if (action === 'finalize_period') {
    const { period_id } = body

    if (!period_id) {
      return NextResponse.json({ error: 'period_id required' }, { status: 400 })
    }

    // Finalize all draft payslips in this period
    const { error: slipError } = await admin
      .from('payslips')
      .update({ status: 'finalized' })
      .eq('period_id', period_id)
      .eq('shop_id', shop_id)
      .eq('status', 'draft')

    if (slipError) {
      return NextResponse.json({ error: slipError.message }, { status: 500 })
    }

    // Mark the period itself as finalized
    const { data: period, error: periodError } = await admin
      .from('payroll_periods')
      .update({ status: 'finalized' })
      .eq('id', period_id)
      .eq('shop_id', shop_id)
      .select()
      .single()

    if (periodError) {
      return NextResponse.json({ error: periodError.message }, { status: 500 })
    }

    // ── Write financial_entries: one expense row per payslip ─────────────────
    const { data: finalizedSlips } = await admin
      .from('payslips')
      .select('id, net_pay, snapshot_name, period_id')
      .eq('period_id', period_id)
      .eq('shop_id', shop_id)

    if (finalizedSlips && finalizedSlips.length > 0) {
      const entryDate = period.period_end ?? new Date().toISOString().split('T')[0]

      const ledgerEntries = finalizedSlips
        .filter(slip => slip.net_pay > 0)
        .map(slip => ({
          shop_id,
          entry_date: entryDate,
          type: 'expense',
          category: 'payroll',
          amount: parseFloat(slip.net_pay.toFixed(2)),
          direction: 'out',
          reference_type: 'payslip',
          reference_id: slip.id,
          note: `Payroll: ${slip.snapshot_name ?? 'Employee'}`,
        }))

      if (ledgerEntries.length > 0) {
        await admin.from('financial_entries').insert(ledgerEntries)
      }
    }

    return NextResponse.json({ period })
  }

  // ── UPDATE SINGLE PAYSLIP (admin override) ─────────────────────────────────
  if (action === 'update_payslip') {
    const { payslip_id, updates } = body

    if (!payslip_id || !updates) {
      return NextResponse.json({ error: 'payslip_id and updates required' }, { status: 400 })
    }

    // Recalculate net_pay from updated fields if numeric fields changed
    const {
      basic_pay,
      overtime_pay,
      allowance,
      late_deduction,
      sss_contribution,
      philhealth_contribution,
      pagibig_contribution,
      tax_withheld,
    } = updates

    // Fetch current payslip to fill in any unchanged fields
    const { data: current } = await admin
      .from('payslips')
      .select('*')
      .eq('id', payslip_id)
      .eq('shop_id', shop_id)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
    }

    if (current.status === 'finalized') {
      return NextResponse.json({ error: 'Cannot edit a finalized payslip' }, { status: 400 })
    }

    const merged = { ...current, ...updates }

    const gross = merged.basic_pay + merged.overtime_pay + merged.allowance
    const deductions = merged.late_deduction + merged.sss_contribution +
      merged.philhealth_contribution + merged.pagibig_contribution + merged.tax_withheld
    const net_pay = parseFloat((gross - deductions).toFixed(2))

    const { data: payslip, error } = await admin
      .from('payslips')
      .update({ ...updates, net_pay })
      .eq('id', payslip_id)
      .eq('shop_id', shop_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payslip })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// ─── DELETE /api/payroll ──────────────────────────────────────────────────────
// Delete a draft payroll period (and its payslips via cascade or manual delete)
// Cannot delete finalized periods.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const period_id = searchParams.get('period_id')

  if (!period_id) {
    return NextResponse.json({ error: 'period_id required' }, { status: 400 })
  }

  // Prevent deletion of finalized periods
  const { data: period } = await admin
    .from('payroll_periods')
    .select('status')
    .eq('id', period_id)
    .eq('shop_id', appUser.shop_id)
    .single()

  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  if (period.status === 'finalized') {
    return NextResponse.json({ error: 'Cannot delete a finalized payroll period' }, { status: 400 })
  }

  // Delete payslips first (in case no cascade)
  await admin.from('payslips').delete().eq('period_id', period_id).eq('shop_id', appUser.shop_id)

  // Delete the period
  const { error } = await admin
    .from('payroll_periods')
    .delete()
    .eq('id', period_id)
    .eq('shop_id', appUser.shop_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}