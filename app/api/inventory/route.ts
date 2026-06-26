// app/api/inventory/route.ts
// GET  /api/inventory  -- stock levels for all items
// POST /api/inventory  -- adjust / set / batch_receive stock for one item

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/inventory
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
      id, name, sku, category_id, track_stock, cost, price,
      stock_unit, consumption_unit, unit_conversion,
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
    .select('id, name, color, show_in_inventory')
    .eq('shop_id', shopId)
    .order('name')

  // Fetch active batches — only for inventory-visible items to avoid query size limits
  const inventoryCatIds = new Set(
    (categories || [])
      .filter((c: any) => c.show_in_inventory)
      .map((c: any) => c.id)
  )
  const inventoryItemIds = (items as any[])
    .filter((i: any) => inventoryCatIds.has(i.category_id))
    .map((i: any) => i.id)

  let batchMap: Record<string, any[]> = {}
  if (inventoryItemIds.length > 0) {
    const { data: batchData, error: batchError } = await admin
      .from('stock_batches')
      .select('id, item_id, batch_no, pack_size, pack_unit, qty_packs, qty_base, qty_remaining, conversion, preset_id, expiry_date, received_at, note')
      .in('item_id', inventoryItemIds)
      .gt('qty_remaining', 0)
      .order('received_at', { ascending: true })

    if (batchError) console.error('[GET /api/inventory] batchError:', batchError.message)

    for (const b of (batchData || [])) {
      if (!batchMap[b.item_id]) batchMap[b.item_id] = []
      batchMap[b.item_id].push(b)
    }
  }

  return NextResponse.json({
    items,
    batches: batchMap,
    categories: categories || [],
    stats: { totalItems, outOfStock, lowStock },
  })
}

// POST /api/inventory
//
// mode=adjust:
//   { item_id, mode:'adjust', adj_type:'restock'|'adjustment'|'loss', quantity, note? }
//
// mode=set:
//   { item_id, mode:'set', quantity, low_stock_alert?, note? }
//
// mode=batch_receive:
//   { item_id, mode:'batch_receive', batch_no?, expiry_date?, pack_size, pack_unit, qty_packs, conversion, note? }
//   qty_base = qty_packs * pack_size * conversion  (total base units added to stock)

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
  const { item_id, mode } = body

  if (!item_id || !mode) {
    return NextResponse.json({ error: 'item_id and mode are required' }, { status: 400 })
  }

  // Fetch current inventory_levels row (shared by all modes)
  const { data: inv } = await admin
    .from('inventory_levels')
    .select('id, quantity')
    .eq('item_id', item_id)
    .eq('shop_id', shopId)
    .is('variant_id', null)
    .maybeSingle()

  const beforeQty = inv ? Number(inv.quantity) : 0

  try {
    // ── batch_receive ──────────────────────────────────────────────────────
    if (mode === 'batch_receive') {
      const {
        batch_no    = null,
        expiry_date = null,
        pack_size   = 1,
        pack_unit   = 'pcs',
        qty_packs,
        conversion  = 1,
        note        = null,
      } = body

      if (!qty_packs || Number(qty_packs) <= 0) {
        return NextResponse.json({ error: 'qty_packs must be > 0' }, { status: 400 })
      }

      const qtyBase  = Number(qty_packs) * Number(pack_size) * Number(conversion)
      const newQty   = beforeQty + qtyBase

      // 1. Insert stock_batches row
      const { data: batch, error: batchErr } = await admin
        .from('stock_batches')
        .insert({
          shop_id:       shopId,
          item_id,
          batch_no:      batch_no || null,
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
          .insert({ shop_id: shopId, item_id, quantity: newQty, low_stock_alert: 0, variant_id: null })
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
    }

    // ── adjust / set ───────────────────────────────────────────────────────
    const { adj_type, quantity, low_stock_alert, note } = body

    if (quantity == null) {
      return NextResponse.json({ error: 'quantity is required' }, { status: 400 })
    }
    if (mode === 'adjust' && !adj_type) {
      return NextResponse.json({ error: 'adj_type required for mode=adjust' }, { status: 400 })
    }

    let newQty: number
    let movementQty: number
    let movementType: string

    if (mode === 'set') {
      newQty       = Math.max(0, Number(quantity))
      movementQty  = newQty - beforeQty
      movementType = 'adjustment'
    } else {
      const delta = Math.abs(Number(quantity))
      if (adj_type === 'loss') {
        newQty      = Math.max(0, beforeQty - delta)
        movementQty = -(beforeQty - newQty)
      } else {
        newQty      = beforeQty + delta
        movementQty = delta
      }
      movementType = adj_type
    }

    if (inv?.id) {
      const updateData: any = { quantity: newQty, updated_at: new Date().toISOString() }
      if (mode === 'set' && low_stock_alert != null) {
        updateData.low_stock_alert = Number(low_stock_alert)
      }
      const { error } = await admin.from('inventory_levels').update(updateData).eq('id', inv.id)
      if (error) throw error
    } else {
      const { error } = await admin.from('inventory_levels').insert({
        shop_id: shopId, item_id, quantity: newQty,
        low_stock_alert: mode === 'set' ? (Number(low_stock_alert) || 0) : 0,
        variant_id: null,
      })
      if (error) throw error
    }

    // ── When manually setting stock, sync batches via FIFO ──────────────
    // Distributes the new quantity across batches oldest-first (FIFO)
    if (mode === 'set') {
      // Fetch all active batches ordered oldest first (FIFO)
      const { data: activeBatches, error: fetchErr } = await admin
        .from('stock_batches')
        .select('id, qty_remaining')
        .eq('item_id', item_id)
        .eq('shop_id', shopId)
        .gt('qty_remaining', 0)
        .order('received_at', { ascending: true })
      if (fetchErr) throw fetchErr

      if (activeBatches && activeBatches.length > 0) {
        let remaining = newQty  // total to distribute across batches

        for (const batch of activeBatches) {
          if (remaining <= 0) {
            const { error } = await admin
              .from('stock_batches')
              .update({ qty_remaining: 0 })
              .eq('id', batch.id)
            if (error) throw error
          } else if (remaining >= batch.qty_remaining) {
            remaining -= batch.qty_remaining
          } else {
            const { error } = await admin
              .from('stock_batches')
              .update({ qty_remaining: remaining })
              .eq('id', batch.id)
            if (error) throw error
            remaining = 0
          }
        }
      }
    }

    // ── On loss/dispense, deduct from batches FIFO ──────────────────────
    if (mode === 'adjust' && adj_type === 'loss') {
      const { data: activeBatches, error: fetchErr } = await admin
        .from('stock_batches')
        .select('id, qty_remaining')
        .eq('item_id', item_id)
        .eq('shop_id', shopId)
        .gt('qty_remaining', 0)
        .order('received_at', { ascending: true })
      if (fetchErr) throw fetchErr

      if (activeBatches && activeBatches.length > 0) {
        let toDeduct = Math.abs(movementQty) // movementQty is negative, so abs it

        for (const batch of activeBatches) {
          if (toDeduct <= 0) break
          const deductFromBatch = Math.min(toDeduct, batch.qty_remaining)
          const { error } = await admin
            .from('stock_batches')
            .update({ qty_remaining: batch.qty_remaining - deductFromBatch })
            .eq('id', batch.id)
          if (error) throw error
          toDeduct -= deductFromBatch
        }
      }
    }

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