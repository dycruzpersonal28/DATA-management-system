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
        finalized_count: slips?.filter(s => s.status === 'released').length ?? 0,
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
    .select('shop_id, role')
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
      .select('id, name, employee_no, role, hourly_rate, allowance, employment_type, sss_no, philhealth_no, pagibig_no, govt_deductions_enabled')
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

      // Philippine statutory deductions — only applied if govt_deductions_enabled is true
      const govtEnabled = emp.govt_deductions_enabled === true
      const monthly_basic = basic_pay * 2  // rough monthly estimate
      const sss_contribution        = govtEnabled ? Math.min(monthly_basic * 0.045, 900) / 2 : 0
      const philhealth_contribution = govtEnabled ? (monthly_basic * 0.025) / 2 : 0
      const pagibig_contribution    = govtEnabled ? 100 / 2 : 0  // ₱100/month flat → ₱50 semi-monthly

      const gross_pay = basic_pay + overtime_pay + allowance
      const total_deductions = late_deduction + sss_contribution + philhealth_contribution + pagibig_contribution
      const net_pay = gross_pay - total_deductions

      // Only insert columns that exist in the payslips table.
      // Snapshot columns (snapshot_name, snapshot_role, etc.) are optional —
      // remove any that don't exist in your schema to avoid constraint errors.
      const insert: Record<string, any> = {
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
        other_deductions: [],
        total_hours:    parseFloat(logs.total_hours.toFixed(2)),
        overtime_hours: parseFloat(logs.overtime_hours.toFixed(2)),
        late_minutes:   logs.late_minutes,
      }

      // ── Employee snapshot columns — comment out any that don't exist in your table ──
      // insert.snapshot_name            = emp.name
      // insert.snapshot_employee_no     = emp.employee_no    ?? null
      // insert.snapshot_role            = emp.role           ?? null
      // insert.snapshot_employment_type = emp.employment_type ?? null
      // insert.snapshot_sss_no          = emp.sss_no         ?? null
      // insert.snapshot_philhealth_no   = emp.philhealth_no  ?? null
      // insert.snapshot_pagibig_no      = emp.pagibig_no     ?? null

      return insert
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
      .update({ status: 'released' })
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

    if (current.status === 'released') {
      return NextResponse.json({ error: 'Cannot edit a finalized payslip' }, { status: 400 })
    }

    // Strip any fields that must not be overwritten via this endpoint
    const { status: _s, id: _i, shop_id: _sh, employee_id: _e, period_id: _p, ...safeUpdates } = updates as any

    const merged = { ...current, ...safeUpdates }

    const gross = merged.basic_pay + merged.overtime_pay + merged.allowance
    const otherTotal = (merged.other_deductions ?? []).reduce((s: number, o: any) => s + (o.amount ?? 0), 0)
    const deductions = merged.late_deduction + merged.sss_contribution +
      merged.philhealth_contribution + merged.pagibig_contribution + merged.tax_withheld + otherTotal
    const net_pay = parseFloat((gross - deductions).toFixed(2))

    const { data: payslip, error } = await admin
      .from('payslips')
      .update({ ...safeUpdates, net_pay })
      .eq('id', payslip_id)
      .eq('shop_id', shop_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payslip })
  }

  // ── VOID PAYSLIP (owner/manager only) ────────────────────────────────────
  if (action === 'void_payslip') {
    const { payslip_id } = body

    if (!payslip_id) {
      return NextResponse.json({ error: 'payslip_id required' }, { status: 400 })
    }

    // Only owners and managers can void finalized payslips
    if (!['owner', 'manager'].includes(appUser.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden: only owners and managers can void payslips' }, { status: 403 })
    }

    // Remove related financial_entries first
    await admin
      .from('financial_entries')
      .delete()
      .eq('shop_id', shop_id)
      .eq('reference_type', 'payslip')
      .eq('reference_id', payslip_id)

    // Delete the payslip
    const { error: deleteError } = await admin
      .from('payslips')
      .delete()
      .eq('id', payslip_id)
      .eq('shop_id', shop_id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
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

  // Collect payslip IDs so we can remove their financial_entries mirrors
  const { data: payslipsToDelete } = await admin
    .from('payslips')
    .select('id')
    .eq('period_id', period_id)
    .eq('shop_id', appUser.shop_id)

  const payslipIds = (payslipsToDelete ?? []).map(p => p.id)

  // Remove financial_entries written when this period was finalized
  if (payslipIds.length > 0) {
    await admin
      .from('financial_entries')
      .delete()
      .eq('shop_id', appUser.shop_id)
      .eq('reference_type', 'payslip')
      .in('reference_id', payslipIds)
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