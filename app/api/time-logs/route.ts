import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Helper: server time in PHT (UTC+8) ──────────────────────────────────────
function getPHTTime() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const date = now.toISOString().split('T')[0] // YYYY-MM-DD in PHT
  return { now, date }
}

// ─── GET: fetch time logs ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('role, shop_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const date_from   = searchParams.get('date_from')
    const date_to     = searchParams.get('date_to')
    const employee_id = searchParams.get('employee_id')

    const admin = createAdminClient()
    let query = admin
      .from('time_logs')
      .select(`
        id, employee_id, shift_schedule_id, clock_in, clock_out,
        date, total_hours, overtime_hours, late_minutes, is_late,
        approved_by, notes, created_at,
        employees:employees!time_logs_employee_id_fkey ( id, name, role, employee_no ),
        shift_schedules ( id, name, start_time, end_time ),
        approver:employees!time_logs_approved_by_fkey ( id, name )
      `)
      .eq('shop_id', caller.shop_id)
      .order('clock_in', { ascending: false })

    if (date_from)    query = query.gte('date', date_from)
    if (date_to)      query = query.lte('date', date_to)
    if (employee_id)  query = query.eq('employee_id', employee_id)

    const { data: logs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ logs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST: clock in or clock out (kiosk) OR manual log (admin) ───────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, employee_id, employee_pin, manager_pin, shift_schedule_id, shop_id } = body

    // ── Manual log branch (admin/HR use) ─────────────────────────────────────
    // Called from the payroll attendance tab with action='manual'
    // Uses session auth instead of employee PIN
    if (action === 'manual') {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { data: caller } = await supabase
        .from('app_users')
        .select('role, shop_id')
        .eq('auth_user_id', user.id)
        .single()
      if (!caller || !['owner', 'manager', 'admin'].includes(caller.role?.toLowerCase()))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { clock_in, clock_out } = body
      if (!employee_id || !clock_in)
        return NextResponse.json({ error: 'employee_id and clock_in are required' }, { status: 400 })

      const admin = createAdminClient()

      // Derive the date from clock_in (handles both "2025-05-30T08:00:00" and full ISO)
      const date = clock_in.split('T')[0]

      // Build the insert payload
      const payload: Record<string, any> = {
        shop_id: caller.shop_id,
        employee_id,
        clock_in,
        date,
        late_minutes: 0,
        is_late: false,
      }
      if (clock_out) payload.clock_out = clock_out

      const { data: log, error: logError } = await admin
        .from('time_logs')
        .insert(payload)
        .select()
        .single()

      if (logError) return NextResponse.json({ error: logError.message }, { status: 400 })
      return NextResponse.json({ success: true, log })
    }
    // ── End manual log branch ─────────────────────────────────────────────────

    if (!action || !employee_id || !employee_pin || !shop_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Verify employee PIN + fetch rate + require_manager_approval flag
    const { data: employee, error: empError } = await admin
      .from('employees')
      .select('id, name, pin, role, is_active, shop_id, require_manager_approval, hourly_rate')
      .eq('id', employee_id)
      .eq('shop_id', shop_id)
      .single()

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    if (!employee.is_active) {
      return NextResponse.json({ error: 'Employee account is inactive' }, { status: 403 })
    }
    if (!employee.pin || employee.pin !== employee_pin) {
      return NextResponse.json({ error: 'Invalid employee PIN' }, { status: 401 })
    }

    // 2. Manager PIN — only required if require_manager_approval is true
    let approverId: string | null = null

    if (employee.require_manager_approval) {
      if (!manager_pin) {
        return NextResponse.json({ error: 'Manager PIN is required for this employee' }, { status: 400 })
      }

      const { data: fullAccessRoles } = await admin
        .from('roles')
        .select('id')
        .in('name', ['Owner', 'Manager', 'owner', 'manager', 'Admin', 'admin'])

      const fullAccessRoleIds = (fullAccessRoles ?? []).map((r: any) => r.id)

      const { data: managers } = await admin
        .from('employees')
        .select('id, pin, role, role_id')
        .eq('shop_id', shop_id)
        .eq('is_active', true)

      const validManager = managers?.find(m =>
        m.pin && m.pin === manager_pin && (
          (m.role_id && fullAccessRoleIds.includes(m.role_id)) ||
          ['manager', 'owner', 'Manager', 'Owner'].includes(m.role)
        )
      )

      if (!validManager) {
        return NextResponse.json({ error: 'Invalid manager PIN' }, { status: 401 })
      }

      approverId = validManager.id
    }

    // ✅ Always use server-side PHT time — never trust device/client time
    const { now, date } = getPHTTime()

    if (action === 'clock_in') {
      // Check if already clocked in today without clocking out
      const { data: existing } = await admin
        .from('time_logs')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', date)
        .is('clock_out', null)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Employee is already clocked in' }, { status: 409 })
      }

      // Calculate late minutes if shift is assigned
      let late_minutes = 0
      let is_late = false

      if (shift_schedule_id) {
        const { data: shift } = await admin
          .from('shift_schedules')
          .select('start_time')
          .eq('id', shift_schedule_id)
          .single()

        if (shift) {
          const [sh, sm] = shift.start_time.split(':').map(Number)
          const phtHour = now.getUTCHours()
          const phtMin  = now.getUTCMinutes()
          const shiftStartMinutes = sh * 60 + sm
          const nowMinutes        = phtHour * 60 + phtMin

          if (nowMinutes > shiftStartMinutes) {
            late_minutes = nowMinutes - shiftStartMinutes
            is_late = true
          }
        }
      }

      const { data: log, error: logError } = await admin
        .from('time_logs')
        .insert({
          shop_id,
          employee_id,
          shift_schedule_id: shift_schedule_id || null,
          clock_in: new Date().toISOString(),
          date,
          late_minutes,
          is_late,
          approved_by: approverId,
        })
        .select()
        .single()

      if (logError) return NextResponse.json({ error: logError.message }, { status: 400 })
      return NextResponse.json({ success: true, action: 'clock_in', log, employee: { name: employee.name } })
    }

    if (action === 'clock_out') {
      const { data: openLog } = await admin
        .from('time_logs')
        .select('id, clock_in, shift_schedule_id')
        .eq('employee_id', employee_id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .single()

      if (!openLog) {
        return NextResponse.json({ error: 'No active clock-in found' }, { status: 404 })
      }

      // Calculate overtime if shift is assigned
      let overtime_hours = 0
      if (openLog.shift_schedule_id) {
        const { data: shift } = await admin
          .from('shift_schedules')
          .select('end_time')
          .eq('id', openLog.shift_schedule_id)
          .single()

        if (shift) {
          const [eh, em] = shift.end_time.split(':').map(Number)
          const phtHour = now.getUTCHours()
          const phtMin  = now.getUTCMinutes()
          const shiftEndMinutes = eh * 60 + em
          const nowMinutes      = phtHour * 60 + phtMin

          if (nowMinutes > shiftEndMinutes) {
            overtime_hours = parseFloat(((nowMinutes - shiftEndMinutes) / 60).toFixed(2))
          }
        }
      }

      const clockOutTime = new Date()

      // total_hours is a generated column — Postgres recomputes it from clock_in/clock_out automatically
      const { data: log, error: logError } = await admin
        .from('time_logs')
        .update({
          clock_out: clockOutTime.toISOString(),
          overtime_hours,
          approved_by: approverId,
        })
        .eq('id', openLog.id)
        .select()
        .single()

      if (logError) return NextResponse.json({ error: logError.message }, { status: 400 })

      // ── PAYROLL: write labor cost to financial_entries on clock-out ──────────
      // Compute actual hours worked from clock_in → clock_out
      const clockInMs  = new Date(openLog.clock_in).getTime()
      const clockOutMs = clockOutTime.getTime()
      const hoursWorked = parseFloat(((clockOutMs - clockInMs) / 1000 / 3600).toFixed(4))

      const hourlyRate = Number(employee.hourly_rate) || 0

      if (hourlyRate > 0 && hoursWorked > 0) {
        const laborCost = parseFloat((hoursWorked * hourlyRate).toFixed(2))

        await admin.from('financial_entries').insert({
          shop_id,
          entry_date: date,
          type: 'expense',
          category: 'payroll',
          amount: laborCost,
          direction: 'out',
          reference_type: 'time_log',
          reference_id: openLog.id,
          note: `Payroll: ${employee.name} — ${hoursWorked.toFixed(2)}h × ₱${hourlyRate}/hr`,
        })
      }
      // ── end payroll ──────────────────────────────────────────────────────────

      return NextResponse.json({
        success: true,
        action: 'clock_out',
        log,
        employee: { name: employee.name },
        payroll: {
          hours: hoursWorked,
          rate: hourlyRate,
          cost: parseFloat(((hoursWorked * hourlyRate)).toFixed(2)),
        },
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── PATCH: admin manual adjustment ──────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('role, shop_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller || !['owner', 'manager'].includes(caller.role?.toLowerCase()))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, clock_in, clock_out, late_minutes, is_late, overtime_hours, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'Log ID required' }, { status: 400 })

    const admin = createAdminClient()

    // total_hours is a generated column — Postgres recomputes automatically
    const { data: log, error } = await admin
      .from('time_logs')
      .update({ clock_in, clock_out, late_minutes, is_late, overtime_hours, notes })
      .eq('id', id)
      .eq('shop_id', caller.shop_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, log })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
