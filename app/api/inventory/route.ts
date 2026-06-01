// app/api/inventory/route.ts
// GET  /api/inventory          — stock levels for all items
// POST /api/inventory          — adjust / set stock for one item

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── GET /api/inventory ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId = await (async () => {
    const { data } = await admin
      .from('app_users')
      .select('shop_id')
      .eq('auth_user_id', user.id)
      .single()
    return data?.shop_id ?? null
  })()
  if (!shopId) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const stock    = searchParams.get('stock')
  const q        = searchParams.get('q')

  let query = admin
    .from('items')
    .select(`
      id, name, sku, category_id, track_stock,
      categories!items_category_id_fkey(name, color),
      inventory_levels(id, quantity, low_stock_alert, variant_id)
    `)
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('name')

  if (category) query = query.eq('category_id', category)
  if (q)        query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let items = data || []

  if (stock === 'out') {
    items = items.filter(i => (i.inventory_levels?.[0]?.quantity ?? 0) === 0)
  } else if (stock === 'low') {
    items = items.filter(i => {
      const inv = i.inventory_levels?.[0]
      const qty = inv?.quantity ?? 0; const alert = inv?.low_stock_alert ?? 0
      return qty > 0 && alert > 0 && qty <= alert
    })
  } else if (stock === 'ok') {
    items = items.filter(i => {
      const inv = i.inventory_levels?.[0]
      const qty = inv?.quantity ?? 0; const alert = inv?.low_stock_alert ?? 0
      return qty > alert
    })
  }

  const totalItems = items.length
  const outOfStock = items.filter(i => (i.inventory_levels?.[0]?.quantity ?? 0) === 0).length
  const lowStock   = items.filter(i => {
    const inv = i.inventory_levels?.[0]
    const qty = inv?.quantity ?? 0; const alert = inv?.low_stock_alert ?? 0
    return qty > 0 && alert > 0 && qty <= alert
  }).length

  const { data: categories } = await admin
    .from('categories')
    .select('id, name, color')
    .eq('shop_id', shopId)
    .order('name')

  return NextResponse.json({
    items,
    categories: categories || [],
    stats: { totalItems, outOfStock, lowStock },
  })
}

// ── POST /api/inventory ───────────────────────────────────────────────────────
// Body:
// {
//   item_id:          string
//   mode:             'adjust' | 'set'
//   adj_type?:        'restock' | 'adjustment' | 'loss'  (required when mode=adjust)
//   quantity:         number
//   low_stock_alert?: number  (only applied when mode=set)
//   note?:            string
// }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch app_user row to get name (same pattern as receipts → employee_id → app_users(name))
  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, name')
    .eq('auth_user_id', user.id)
    .single()

  const shopId = appUser?.shop_id ?? null
  if (!shopId) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const createdByName: string | null = appUser?.name ?? null

  const body = await req.json()
  const { item_id, mode, adj_type, quantity, low_stock_alert, note } = body

  if (!item_id || !mode || quantity == null) {
    return NextResponse.json({ error: 'item_id, mode, and quantity are required' }, { status: 400 })
  }
  if (mode === 'adjust' && !adj_type) {
    return NextResponse.json({ error: 'adj_type required for mode=adjust' }, { status: 400 })
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

    let newQty: number
    let movementQty: number
    let movementType: string

    if (mode === 'set') {
      newQty       = Math.max(0, Number(quantity))
      movementQty  = newQty - beforeQty   // net delta so log makes sense
      movementType = 'adjustment'
    } else {
      const delta  = Math.abs(Number(quantity))
      if (adj_type === 'loss') {
        newQty      = Math.max(0, beforeQty - delta)
        movementQty = -(beforeQty - newQty)  // actual deducted (respects floor 0)
      } else {
        // restock | adjustment
        newQty      = beforeQty + delta
        movementQty = delta
      }
      movementType = adj_type
    }

    // Upsert inventory_levels
    if (inv?.id) {
      const updateData: any = { quantity: newQty, updated_at: new Date().toISOString() }
      if (mode === 'set' && low_stock_alert != null) {
        updateData.low_stock_alert = Number(low_stock_alert)
      }
      const { error } = await admin
        .from('inventory_levels')
        .update(updateData)
        .eq('id', inv.id)
      if (error) throw error
    } else {
      const { error } = await admin
        .from('inventory_levels')
        .insert({
          shop_id:         shopId,
          item_id,
          quantity:        newQty,
          low_stock_alert: mode === 'set' ? (Number(low_stock_alert) || 0) : 0,
          variant_id:      null,
        })
      if (error) throw error
    }

    // Write stock_movement with before/after snapshot and who made the change
    const { error: mvErr } = await admin
      .from('stock_movements')
      .insert({
        shop_id:    shopId,
        item_id,
        type:       movementType,
        quantity:   movementQty,
        before_qty: beforeQty,
        after_qty:  newQty,
        note:       note || (mode === 'set' ? 'Manual stock set' : null),
        created_by: createdByName,
      })
    if (mvErr) throw mvErr

    return NextResponse.json({ ok: true, newQty })
  } catch (err: any) {
    console.error('[POST /api/inventory]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
