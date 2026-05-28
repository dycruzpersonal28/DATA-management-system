import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Helper: get authenticated user's shop_id + role
async function getAuthContext() {
  const supabase = await createClient()
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

// GET /api/roles — list all roles for the shop
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('roles')
    .select('id, name, color, created_at')
    .eq('shop_id', ctx.shop_id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST /api/roles — create a new role
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, color } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('roles')
    .insert({ shop_id: ctx.shop_id, name: name.trim(), color: color ?? '#6366f1' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/roles — update a role
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, name, color } = body

  if (!id) {
    return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })
  }

  const updates: Record<string, string> = {}
  if (name?.trim()) updates.name = name.trim()
  if (color) updates.color = color

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('roles')
    .update(updates)
    .eq('id', id)
    .eq('shop_id', ctx.shop_id) // scope to shop for safety
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE /api/roles?id=<uuid> — delete a role (only if no employees assigned)
export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check if any employees are assigned to this role
  const { count, error: countError } = await admin
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', id)
    .eq('shop_id', ctx.shop_id)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} employee(s) are assigned to this role.` },
      { status: 409 }
    )
  }

  const { error } = await admin
    .from('roles')
    .delete()
    .eq('id', id)
    .eq('shop_id', ctx.shop_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
