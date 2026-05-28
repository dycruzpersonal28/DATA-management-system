import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function getAuthContext() {
  const supabase = await createClient()          // ← await fixed
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const admin = createAdminClient()
  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, role')
    .eq('auth_user_id', user.id)
    .single()

  return appUser ?? null
}

async function verifyEmployeeShop(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
  shopId: string
): Promise<boolean> {
  const { data } = await admin
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('shop_id', shopId)
    .single()
  return !!data
}

// GET /api/employee-permissions?employee_id=<uuid>
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employee_id')
  if (!employeeId) return NextResponse.json({ error: 'employee_id is required' }, { status: 400 })

  const admin = createAdminClient()

  const belongs = await verifyEmployeeShop(admin, employeeId, ctx.shop_id)
  if (!belongs) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // All shop permissions
  const { data: allPerms, error: permsError } = await admin
    .from('permissions')
    .select('id, name, label, category')
    .eq('shop_id', ctx.shop_id)
    .order('category', { ascending: true })
    .order('label',    { ascending: true })

  if (permsError) return NextResponse.json({ error: permsError.message }, { status: 500 })

  // Granted permission IDs for this employee
  const { data: granted, error: grantedError } = await admin
    .from('employee_permissions')
    .select('permission_id')
    .eq('employee_id', employeeId)

  if (grantedError) return NextResponse.json({ error: grantedError.message }, { status: 500 })

  const grantedSet = new Set((granted ?? []).map(g => g.permission_id))

  const flat = (allPerms ?? []).map(p => ({ ...p, granted: grantedSet.has(p.id) }))

  return NextResponse.json({ flat })
}

// POST /api/employee-permissions
// Body: { employee_id, permission_ids: string[] }
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(ctx.role?.toLowerCase()))  // ← fix: toLowerCase()
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { employee_id, permission_ids } = body

  if (!employee_id) return NextResponse.json({ error: 'employee_id is required' }, { status: 400 })
  if (!Array.isArray(permission_ids)) return NextResponse.json({ error: 'permission_ids must be an array' }, { status: 400 })

  const admin = createAdminClient()

  const belongs = await verifyEmployeeShop(admin, employee_id, ctx.shop_id)
  if (!belongs) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Validate all IDs belong to this shop
  if (permission_ids.length > 0) {
    const { data: validPerms, error: validError } = await admin
      .from('permissions')
      .select('id')
      .eq('shop_id', ctx.shop_id)
      .in('id', permission_ids)

    if (validError) return NextResponse.json({ error: validError.message }, { status: 500 })
    if ((validPerms ?? []).length !== permission_ids.length)
      return NextResponse.json({ error: 'One or more permission IDs are invalid.' }, { status: 400 })
  }

  // Atomic replace
  const { error: deleteError } = await admin
    .from('employee_permissions')
    .delete()
    .eq('employee_id', employee_id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (permission_ids.length > 0) {
    const rows = permission_ids.map((permission_id: string) => ({ employee_id, permission_id }))
    const { error: insertError } = await admin
      .from('employee_permissions')
      .insert(rows)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, granted_count: permission_ids.length })
}