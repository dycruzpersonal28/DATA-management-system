import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Columns we select for employees — no old boolean permission columns
const EMPLOYEE_SELECT = `
  id, name, email, role, role_id, employee_no, address, mobile_number,
  pin, hourly_rate, allowance, employment_type,
  sss_no, philhealth_no, pagibig_no,
  is_active, is_kiosk_visible, require_manager_approval, govt_deductions_enabled, created_at
`

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: caller } = await supabase
    .from('app_users')
    .select('role, shop_id')
    .eq('auth_user_id', user.id)
    .single()

  return caller ? { ...caller, supabase } : null
}

// ── GET /api/employees ────────────────────────────────────────────────────────
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

    const admin = createAdminClient()
    const { data: employees, error } = await admin
      .from('employees')
      .select(EMPLOYEE_SELECT)
      .eq('shop_id', caller.shop_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ employees, shop_id: caller.shop_id })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/employees — create employee + auth user + app_user ──────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('role, shop_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!caller || !['owner', 'manager'].includes(caller.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden: only owners and managers can create employees' }, { status: 403 })
    }

    const body = await req.json()
    const {
      email,
      password,
      name,
      role_id = null,
      employee_no,
      address,
      mobile_number,
      pin,
      hourly_rate,
      allowance,
      sss_no,
      philhealth_no,
      pagibig_no,
      employment_type = 'full-time',
      require_manager_approval = true,  // ← NEW: default true
    } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Look up the role name from the roles table using role_id
    let role = 'cashier' // fallback
    if (role_id) {
      const { data: roleRow } = await admin
        .from('roles')
        .select('name')
        .eq('id', role_id)
        .single()
      if (roleRow?.name) role = roleRow.name
    }

    // 1. Create Supabase Auth user
    const { data: authData, error: createAuthError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || email },
    })
    if (createAuthError) {
      return NextResponse.json({ error: createAuthError.message }, { status: 400 })
    }
    const authUserId = authData.user.id

    // 2. Create app_user record
    const { data: appUser, error: appUserError } = await admin
      .from('app_users')
      .insert({
        auth_user_id: authUserId,
        shop_id: caller.shop_id,
        name: name || email,
        email,
        role,
        role_id,
        is_active: true,
      })
      .select('id')
      .single()

    if (appUserError) {
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: `Failed to create app user: ${appUserError.message}` }, { status: 400 })
    }

    // 3. Create employee record
    const { data: employee, error: employeeError } = await admin
      .from('employees')
      .insert({
        shop_id: caller.shop_id,
        app_user_id: appUser.id,
        auth_user_id: authUserId,
        name: name || email,
        email,
        role,
        role_id,
        pin: pin || null,
        employee_no: employee_no || null,
        address: address || null,
        mobile_number: mobile_number || null,
        hourly_rate: hourly_rate || 0,
        allowance: allowance || 0,
        sss_no: sss_no || null,
        philhealth_no: philhealth_no || null,
        pagibig_no: pagibig_no || null,
        employment_type,
        require_manager_approval,
        govt_deductions_enabled: body.govt_deductions_enabled ?? false,
        is_active: true,
      })
      .select('id, name, email, role, role_id, employee_no')
      .single()

    if (employeeError) {
      await admin.from('app_users').delete().eq('id', appUser.id)
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: `Failed to create employee: ${employeeError.message}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, employee })

  } catch (err: any) {
    console.error('Create employee error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/employees ──────────────────────────────────────────────────────
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

    if (!caller || !['owner', 'manager'].includes(caller.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { id, ...rawUpdates } = body
    if (!id) return NextResponse.json({ error: 'Employee ID required' }, { status: 400 })

    // Strip fields that don't belong in the employees table
    const {
      can_apply_discounts, can_void_sales, can_view_reports, can_manage_inventory, // old boolean fields
      password, must_change_password,  // auth fields — handled separately below
      ...updates
    } = rawUpdates

    // If a password reset was requested, update via Supabase Auth
    if (password) {
      const { data: empRecord } = await (createAdminClient())
        .from('employees')
        .select('auth_user_id')
        .eq('id', id)
        .single()
      if (empRecord?.auth_user_id) {
        const adminClient = createAdminClient()
        await adminClient.auth.admin.updateUserById(empRecord.auth_user_id, { password })
        if (must_change_password !== undefined) {
          await adminClient
            .from('app_users')
            .update({ must_change_password })
            .eq('auth_user_id', empRecord.auth_user_id)
          await adminClient
            .from('employees')
            .update({ must_change_password })
            .eq('id', id)
        }
      }
    }

    const admin = createAdminClient()

    // require_manager_approval is a plain boolean column — passes through `updates` automatically
    const { data: employee, error: empError } = await admin
      .from('employees')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', caller.shop_id)
      .select('id, name, email, role, role_id')
      .single()

    if (empError) return NextResponse.json({ error: empError.message }, { status: 400 })

    // Sync role + role_id to app_users if changed
    if ((updates.role || updates.role_id) && employee) {
      let roleName = updates.role

      if (!roleName && updates.role_id) {
        const { data: roleRow } = await admin
          .from('roles')
          .select('name')
          .eq('id', updates.role_id)
          .single()
        roleName = roleRow?.name
      }

      await admin
        .from('app_users')
        .update({
          ...(roleName        ? { role:    roleName        } : {}),
          ...(updates.role_id ? { role_id: updates.role_id } : {}),
        })
        .eq('shop_id', caller.shop_id)
        .eq('email', employee.email)
    }

    return NextResponse.json({ success: true, employee })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/employees?id=<uuid> ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('role, shop_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!caller || caller.role?.toLowerCase() !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: only owners can delete employees' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Employee ID required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: employee } = await admin
      .from('employees')
      .select('id, auth_user_id, app_user_id')
      .eq('id', id)
      .eq('shop_id', caller.shop_id)
      .single()

    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Delete in order: permissions → employee → app_user → auth user
    await admin.from('employee_permissions').delete().eq('employee_id', id)
    await admin.from('employees').delete().eq('id', id)
    if (employee.app_user_id) await admin.from('app_users').delete().eq('id', employee.app_user_id)
    if (employee.auth_user_id) await admin.auth.admin.deleteUser(employee.auth_user_id)

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
