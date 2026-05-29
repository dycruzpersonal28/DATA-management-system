// app/api/transactions/[id]/void/route.ts
// POST /api/transactions/[id]/void
// Marks a receipt as voided, reverts inventory_levels for every receipt_item,
// and writes an inventory_logs row per item so the movement log reflects it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { shop_id } = appUser
  const { id: receipt_id } = await params

  // Optional void metadata from request body
  const body = await req.json().catch(() => ({}))
  const voided_by = body.voided_by ?? null
  const voided_at = body.voided_at ?? new Date().toISOString()
  const void_note = body.void_note ?? null

  // Fetch the receipt
  const { data: receipt, error: receiptErr } = await admin
    .from('receipts')
    .select('id, status, receipt_number, shop_id')
    .eq('id', receipt_id)
    .eq('shop_id', shop_id)
    .single()

  if (receiptErr || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }
  if (receipt.status === 'voided') {
    return NextResponse.json({ error: 'Receipt is already voided' }, { status: 409 })
  }

  // Fetch receipt items
  const { data: items, error: itemsErr } = await admin
    .from('receipt_items')
    .select('id, item_id, variant_id, quantity, item_name')
    .eq('receipt_id', receipt_id)

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  const receiptItems = items || []

  // Mark receipt as voided — include metadata if columns exist
  const voidUpdate: Record<string, any> = { status: 'voided' }
  if (voided_by) voidUpdate.voided_by = voided_by
  if (voided_at) voidUpdate.voided_at = voided_at
  if (void_note) voidUpdate.void_note = void_note

  const { error: voidErr } = await admin
    .from('receipts')
    .update(voidUpdate)
    .eq('id', receipt_id)

  if (voidErr) {
    return NextResponse.json({ error: voidErr.message }, { status: 500 })
  }

  // Revert inventory for each item that has an item_id
  const stockableItems = receiptItems.filter(i => i.item_id)
  const logs: any[] = []

  console.log('[VOID] stockableItems:', JSON.stringify(stockableItems))

  for (const item of stockableItems) {
    const qty = Number(item.quantity)

    // ── Check if this item has ingredients (recipe-based) ──────────────────────
    const { data: ingredients, error: ingErr } = await admin
      .from('item_ingredients')
      .select('ingredient_id, quantity')
      .eq('item_id', item.item_id)
      .eq('shop_id', shop_id)

    console.log('[VOID] ingredients for', item.item_id, ':', JSON.stringify(ingredients), 'err:', ingErr?.message)

    if (ingredients && ingredients.length > 0) {
      // Fetch ingredient names — try both items and ingredients tables
      const ingIds = ingredients.map((i: any) => i.ingredient_id)
      const { data: ingNamesFromItems } = await admin
        .from('items')
        .select('id, name')
        .in('id', ingIds)
      const { data: ingNamesFromIngredients } = await admin
        .from('ingredients')
        .select('id, name')
        .in('id', ingIds)
      const ingNameMap: Record<string, string> = Object.fromEntries([
        ...(ingNamesFromIngredients || []).map((i: any) => [i.id, i.name]),
        ...(ingNamesFromItems || []).map((i: any) => [i.id, i.name]),
      ])

      console.log('[VOID] ingNameMap:', JSON.stringify(ingNameMap))

      // Ingredient-based item — reverse each ingredient
      for (const ing of ingredients) {
        const ingQty = Number(ing.quantity) * qty // scale by how many were sold

        const { data: ingLevel, error: ingLevelErr } = await admin
          .from('inventory_levels')
          .select('id, quantity')
          .eq('shop_id', shop_id)
          .eq('item_id', ing.ingredient_id)
          .is('variant_id', null)
          .maybeSingle()

        console.log('[VOID] ingLevel for', ing.ingredient_id, ':', JSON.stringify(ingLevel), 'err:', ingLevelErr?.message)

        if (ingLevel) {
          const before = Number(ingLevel.quantity ?? 0)
          const after  = before + ingQty

          await admin
            .from('inventory_levels')
            .update({ quantity: after, updated_at: new Date().toISOString() })
            .eq('id', ingLevel.id)

          logs.push({
            shop_id,
            receipt_id,
            item_id:    ing.ingredient_id,
            item_name:  ingNameMap[ing.ingredient_id] ?? `${item.item_name} (ingredient)`,
            before_qty: before,
            after_qty:  after,
            change_qty: ingQty,
          })
        }
      }
    }

    // ── Always also revert the finished item in inventory_levels if it exists ──
    let levelQuery = admin
      .from('inventory_levels')
      .select('id, quantity')
      .eq('shop_id', shop_id)
      .eq('item_id', item.item_id)

    if (item.variant_id) {
      levelQuery = levelQuery.eq('variant_id', item.variant_id)
    } else {
      levelQuery = levelQuery.is('variant_id', null)
    }

    const { data: level } = await levelQuery.single()

    if (level) {
      const before = Number(level.quantity ?? 0)
      const after  = before + qty

      await admin
        .from('inventory_levels')
        .update({ quantity: after, updated_at: new Date().toISOString() })
        .eq('id', level.id)

      logs.push({
        shop_id,
        receipt_id,
        item_id:    item.item_id,
        item_name:  item.item_name ?? 'Unknown',
        before_qty: before,
        after_qty:  after,
        change_qty: qty,
      })
    } else if (!ingredients || ingredients.length === 0) {
      // No inventory_levels row and no ingredients — create one
      await admin
        .from('inventory_levels')
        .insert({
          shop_id,
          item_id:    item.item_id,
          variant_id: item.variant_id ?? null,
          quantity:   qty,
        })

      logs.push({
        shop_id,
        receipt_id,
        item_id:    item.item_id,
        item_name:  item.item_name ?? 'Unknown',
        before_qty: 0,
        after_qty:  qty,
        change_qty: qty,
      })
    }
  }

  // Write all inventory_logs in one insert
  if (logs.length > 0) {
    const { error: logErr } = await admin
      .from('inventory_logs')
      .insert(logs)

    if (logErr) {
      console.error('inventory_logs insert failed on void:', logErr.message)
    }
  }

  return NextResponse.json({
    success:        true,
    receipt_id,
    items_reverted: stockableItems.length,
  })
}
