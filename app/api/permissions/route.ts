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

// GET /api/permissions
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('permissions')
    .select('id, name, label, category, created_at')
    .eq('shop_id', ctx.shop_id)
    .order('category', { ascending: true })
    .order('label',    { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by category for convenience
  const grouped = (data ?? []).reduce<Record<string, typeof data>>((acc, perm) => {
    const key = perm.category ?? 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(perm)
    return acc
  }, {})

  return NextResponse.json({ flat: data ?? [], grouped })
}

// POST /api/permissions
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, label, category } = body

  if (!name?.trim() || !label?.trim())
    return NextResponse.json({ error: 'Name and label are required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('permissions')
    .insert({
      shop_id:  ctx.shop_id,
      name:     name.trim(),
      label:    label.trim(),
      category: category?.trim() ?? 'General',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: `Permission "${name}" already exists.` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/permissions
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, label, category } = body
  if (!id) return NextResponse.json({ error: 'Permission ID is required' }, { status: 400 })

  const updates: Record<string, string> = {}
  if (label?.trim())    updates.label    = label.trim()
  if (category?.trim()) updates.category = category.trim()

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('permissions')
    .update(updates)
    .eq('id', id)
    .eq('shop_id', ctx.shop_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/permissions?id=<uuid>&force=true
export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const force = searchParams.get('force') === 'true'
  if (!id) return NextResponse.json({ error: 'Permission ID is required' }, { status: 400 })

  const admin = createAdminClient()

  const { count } = await admin
    .from('employee_permissions')
    .select('id', { count: 'exact', head: true })
    .eq('permission_id', id)

  if (count && count > 0 && !force)
    return NextResponse.json({ warning: true, message: `Assigned to ${count} employee(s). Pass force=true to delete anyway.`, count }, { status: 409 })

  const { error } = await admin
    .from('permissions')
    .delete()
    .eq('id', id)
    .eq('shop_id', ctx.shop_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
