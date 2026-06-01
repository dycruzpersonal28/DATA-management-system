// app/api/items/[id]/route.ts
// PATCH /api/items/[id] — update cost and/or price for an item
// Restricted to owner and manager roles only

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  // Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch app_user to verify shop and role
  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Role gate — owner and manager only (case-insensitive)
  const role = (appUser.role ?? '').toLowerCase()
  if (!['owner', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: item_id } = await params
  const body = await req.json().catch(() => ({}))

  // Only allow cost and price to be updated via this route
  const updates: Record<string, any> = {}
  if ('cost'  in body) updates.cost  = body.cost  !== null ? Number(body.cost)  : null
  if ('price' in body) updates.price = body.price !== null ? Number(body.price) : null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  // Verify item belongs to this shop before updating
  const { data: item, error: itemErr } = await admin
    .from('items')
    .select('id')
    .eq('id', item_id)
    .eq('shop_id', appUser.shop_id)
    .single()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const { error: updateErr } = await admin
    .from('items')
    .update(updates)
    .eq('id', item_id)

  if (updateErr) {
    console.error('[PATCH /api/items/[id]]', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
