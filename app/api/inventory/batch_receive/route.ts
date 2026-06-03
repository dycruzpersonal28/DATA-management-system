// app/api/inventory/batch_receive/route.ts
// POST /api/inventory/batch_receive
// Body: { item_id, batch_no?, expiry_date?, pack_size, pack_unit, qty_packs, conversion, note? }
// qty_base = qty_packs * pack_size * conversion  (total base units added to stock)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, name')
    .eq('auth_user_id', user.id)
    .single()

  const shopId = appUser?.shop_id ?? null
  if (!shopId) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const createdByName: string | null = appUser?.name ?? null

  const body = await req.json()
  const {
    item_id,
    batch_no    = null,
    expiry_date = null,
    pack_size   = 1,
    pack_unit   = 'pcs',
    qty_packs,
    conversion  = 1,
    note        = null,
  } = body

  if (!item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }
  if (!qty_packs || Number(qty_packs) <= 0) {
    return NextResponse.json({ error: 'qty_packs must be > 0' }, { status: 400 })
  }

  try {
    // Fetch current inventory_levels row
    const { data: inv } = await admin
      .from('inventory_levels')
      .select('id, quantity')
      .eq('item_id', item_id)
      .eq('shop_id', shopId)
      .is('variant_id', null)
      .maybeSingle()

    const beforeQty = inv ? Number(inv.quantity) : 0
    const qtyBase   = Number(qty_packs) * Number(pack_size) * Number(conversion)
    const newQty    = beforeQty + qtyBase

    // 1. Insert stock_batches row
    const { data: batch, error: batchErr } = await admin
      .from('stock_batches')
      .insert({
        shop_id:       shopId,
        item_id,
        batch_no:      batch_no  || null,
        expiry_date:   expiry_date || null,
        pack_size:     Number(pack_size),
        pack_unit:     pack_unit || 'pcs',
        qty_packs:     Number(qty_packs),
        conversion:    Number(conversion),
        qty_base:      qtyBase,
        qty_remaining: qtyBase,
        note:          note || null,
      })
      .select('id')
      .single()
    if (batchErr) throw batchErr

    // 2. Upsert inventory_levels
    if (inv?.id) {
      const { error } = await admin
        .from('inventory_levels')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
      if (error) throw error
    } else {
      const { error } = await admin
        .from('inventory_levels')
        .insert({
          shop_id:         shopId,
          item_id,
          quantity:        newQty,
          low_stock_alert: 0,
          variant_id:      null,
        })
      if (error) throw error
    }

    // 3. Write stock_movement tagged with batch_id
    const { error: mvErr } = await admin
      .from('stock_movements')
      .insert({
        shop_id:    shopId,
        item_id,
        type:       'restock',
        quantity:   qtyBase,
        before_qty: beforeQty,
        after_qty:  newQty,
        batch_id:   batch.id,
        note:       note || (batch_no ? `Batch ${batch_no}` : 'Stock received'),
        created_by: createdByName,
      })
    if (mvErr) throw mvErr

    return NextResponse.json({ ok: true, newQty, batch_id: batch.id })
  } catch (err: any) {
    console.error('[POST /api/inventory/batch_receive]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
