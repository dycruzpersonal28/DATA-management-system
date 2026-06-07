// app/api/transactions/[id]/edit-items/route.ts
// POST /api/transactions/[id]/edit-items
//
// Applies line-item edits to a receipt:
//   - Deletes removed items → restocks ingredients (return_stock) or logs wastage
//   - Inserts new items     → deducts ingredients from inventory
//   - Updates changed items → adjusts inventory by the delta
//   - Recalculates receipt total
//   - Writes a transaction_edit_logs row for the full audit trail

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeletedItem {
  id: string
  item_name: string
  stockAction: 'return_stock' | 'wastage'
}

interface AddedItem {
  item_id?: string | null
  variant_id?: string | null
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  addons?: any[]
  note?: string
}

interface ChangedItem {
  id: string
  item_name: string
  quantity: number       // new quantity
  unit_price: number
  line_total: number
  note?: string
  prev_quantity: number  // original quantity before edit
}

interface RequestBody {
  deleted_items: DeletedItem[]
  added_items: AddedItem[]
  changed_items: ChangedItem[]
  new_total: number
  note: string
  edited_by: string      // app_user id of approving manager
  editor_name: string
}

// ─── Helper: adjust inventory for one item_id (BOM-aware) ────────────────────

async function adjustInventory(
  admin: ReturnType<typeof createAdminClient>,
  shop_id: string,
  item_id: string,
  variant_id: string | null | undefined,
  qtyDelta: number,          // positive = add back to stock, negative = deduct
  movementType: string,      // 'void' | 'sale_edit_add' | 'sale_edit_deduct' | 'loss'
  createdByName: string | null,
  receipt_id: string,
  note: string,
) {
  // Check BOM
  const { data: ingredients } = await admin
    .from('item_ingredients')
    .select('ingredient_id, quantity')
    .eq('item_id', item_id)
    console.log('BOM ingredients for', item_id, ':', ingredients)

  if (ingredients && ingredients.length > 0) {
    // BOM item — adjust each ingredient proportionally
    for (const ing of ingredients) {
      const ingDelta = Number(ing.quantity) * qtyDelta

      const { data: ingLevel } = await admin
        .from('inventory_levels')
        .select('id, quantity')
        .eq('shop_id', shop_id)
        .eq('item_id', ing.ingredient_id)
        .is('variant_id', null)
        .maybeSingle()

       console.log('ingLevel for', ing.ingredient_id, ':', ingLevel)
console.log('ingDelta:', ingDelta, 'movementType:', movementType)

      const beforeQty = ingLevel ? Number(ingLevel.quantity) : 0
      const afterQty  = beforeQty + ingDelta

      if (ingLevel && movementType !== 'loss') {
        await admin
          .from('inventory_levels')
          .update({ quantity: afterQty, updated_at: new Date().toISOString() })
          .eq('id', ingLevel.id)
      }

      const { error: mvErr } = await admin.from('stock_movements').insert({
        shop_id,
        item_id:        ing.ingredient_id,
        type:           movementType,
        quantity:       ingDelta,
        before_qty:     beforeQty,
        after_qty:      movementType === 'loss' ? beforeQty : afterQty,
        created_by:     createdByName,
        reference_type: 'receipt',
        reference_id:   receipt_id,
        note,
      })
      console.log('mvErr:', mvErr)
    }
  } else {
    // Non-BOM item
    let levelQuery = admin
      .from('inventory_levels')
      .select('id, quantity')
      .eq('shop_id', shop_id)
      .eq('item_id', item_id)

    levelQuery = variant_id
      ? levelQuery.eq('variant_id', variant_id)
      : levelQuery.is('variant_id', null)

    const { data: level } = await levelQuery.maybeSingle()

    const beforeQty = level ? Number(level.quantity) : 0
    const afterQty  = beforeQty + qtyDelta

    if (level && movementType !== 'loss') {
      await admin
        .from('inventory_levels')
        .update({ quantity: afterQty, updated_at: new Date().toISOString() })
        .eq('id', level.id)
    }

    await admin.from('stock_movements').insert({
      shop_id,
      item_id,
      variant_id:     variant_id ?? null,
      type:           movementType,
      quantity:       qtyDelta,
      before_qty:     beforeQty,
      after_qty:      movementType === 'loss' ? beforeQty : afterQty,
      created_by:     createdByName,
      reference_type: 'receipt',
      reference_id:   receipt_id,
      note,
    })
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
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

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!['manager', 'owner'].includes(appUser.role.toLowerCase())) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { shop_id }      = appUser
  const createdByName    = appUser.name ?? null
  const { id: receipt_id } = await params

  // Parse body
  const body: RequestBody = await req.json().catch(() => ({})) as RequestBody
  const {
    deleted_items  = [],
    added_items    = [],
    changed_items  = [],
    new_total,
    note           = '',
    edited_by,
    editor_name,
  } = body

  // ADD THIS LINE:
console.log('added_items received:', JSON.stringify(added_items, null, 2))

  // Verify receipt belongs to this shop and is not already voided
  const { data: receipt, error: receiptErr } = await admin
    .from('receipts')
    .select('id, status, shop_id, total')
    .eq('id', receipt_id)
    .eq('shop_id', shop_id)
    .single()

  if (receiptErr || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }
  if (receipt.status === 'voided') {
    return NextResponse.json({ error: 'Cannot edit a voided receipt' }, { status: 409 })
  }

  // ── 1. Handle deleted items ───────────────────────────────────────────────
  for (const item of deleted_items) {
    // Fetch the full receipt_item row so we have item_id / variant_id / quantity
    const { data: ri } = await admin
      .from('receipt_items')
      .select('id, item_id, variant_id, quantity, item_name')
      .eq('id', item.id)
      .single()

    if (!ri) continue

    // Delete the row
    await admin.from('receipt_items').delete().eq('id', item.id)

    // Adjust stock only if the item is tracked
    if (ri.item_id) {
      const qty = Number(ri.quantity)

      if (item.stockAction === 'return_stock') {
        await adjustInventory(
          admin, shop_id, ri.item_id, ri.variant_id,
          +qty,                   // positive = restock
          'void',
          createdByName,
          receipt_id,
          `Edit restock: ${ri.item_name} x${qty} removed from receipt — returned to stock`,
        )
      } else {
        // Wastage — log movement but don't change inventory level
        await adjustInventory(
          admin, shop_id, ri.item_id, ri.variant_id,
          -qty,                   // negative, but type=loss won't update level
          'loss',
          createdByName,
          receipt_id,
          `Edit wastage: ${ri.item_name} x${qty} removed from receipt — marked as wastage`,
        )
      }
    }
  }

  // ── 2. Handle added items ─────────────────────────────────────────────────
  for (const item of added_items) {
    // Insert the new receipt_item row
    await admin.from('receipt_items').insert({
      receipt_id,
      item_id:    item.item_id    ?? null,
      variant_id: item.variant_id ?? null,
      item_name:  item.item_name,
      quantity:   item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      addons:     item.addons     ?? [],
      note:       item.note       ?? '',
    })

    // Deduct stock if tracked
    if (item.item_id) {
      await adjustInventory(
        admin, shop_id, item.item_id, item.variant_id,
        -item.quantity,           // negative = deduct
        'sale_edit_add',
        createdByName,
        receipt_id,
        `Edit add: ${item.item_name} x${item.quantity} added to receipt — ingredients deducted`,
      )
    }
  }

  // ── 3. Handle changed items (qty / price edits) ───────────────────────────
  for (const item of changed_items) {
    // Update the receipt_item row
    await admin
      .from('receipt_items')
      .update({
        quantity:   item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        note:       item.note ?? '',
      })
      .eq('id', item.id)

    // Adjust stock by the delta if tracked
    const { data: ri } = await admin
      .from('receipt_items')
      .select('item_id, variant_id')
      .eq('id', item.id)
      .single()

    if (ri?.item_id) {
      const delta = item.quantity - item.prev_quantity  // + means more ordered, - means reduced
      if (delta !== 0) {
        await adjustInventory(
          admin, shop_id, ri.item_id, ri.variant_id,
          -delta,                 // deduct if more, restock if fewer
          delta > 0 ? 'sale_edit_add' : 'void',
          createdByName,
          receipt_id,
          `Edit qty change: ${item.item_name} ${item.prev_quantity}→${item.quantity}`,
        )
      }
    }
  }

  // ── 4. Update receipt total + note ────────────────────────────────────────
  await admin
    .from('receipts')
    .update({ total: new_total, note })
    .eq('id', receipt_id)

  // ── 5. Audit log ──────────────────────────────────────────────────────────
  await admin.from('transaction_edit_logs').insert({
    receipt_id,
    edited_by,
    editor_name,
    edited_at:  new Date().toISOString(),
    changes: {
      deleted: deleted_items.map(i => ({ id: i.id, name: i.item_name, stockAction: i.stockAction })),
      added:   added_items.map(i => ({ name: i.item_name, qty: i.quantity, price: i.unit_price })),
      changed: changed_items.map(i => ({ id: i.id, name: i.item_name, prev_qty: i.prev_quantity, new_qty: i.quantity })),
      prev_total: receipt.total,
      new_total,
      note_changed: note !== (receipt as any).note,
    },
  })

  return NextResponse.json({
    success: true,
    receipt_id,
    deleted_count: deleted_items.length,
    added_count:   added_items.length,
    changed_count: changed_items.length,
    new_total,
  })
}
