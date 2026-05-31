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
  const voided_by  = body.voided_by  ?? null
  const voided_at  = body.voided_at  ?? new Date().toISOString()
  const void_note  = body.void_note  ?? null
  // 'return_stock' = restore inventory (default), 'wastage' = log as POS wastage, no restock
  const void_type  = body.void_type  ?? 'return_stock'

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

  // ── Revert inventory + write stock_movements ─────────────────────────────
  const stockableItems = receiptItems.filter(i => i.item_id)
  console.log('[VOID DEBUG] void_type:', void_type, '| stockableItems:', stockableItems.length)

  for (const item of stockableItems) {
    const qty = Number(item.quantity)
    console.log('[VOID DEBUG] Processing:', item.item_name, 'item_id:', item.item_id, 'qty:', qty)

    // Check if this item has BOM ingredients
    const { data: ingredients, error: ingErr } = await admin
      .from('item_ingredients')
      .select('ingredient_id, quantity')
      .eq('item_id', item.item_id)

    console.log('[VOID DEBUG] BOM rows:', JSON.stringify(ingredients), 'error:', ingErr)

    if (ingredients && ingredients.length > 0) {
      // BOM-based item
      for (const ing of ingredients) {
        const ingQty = Number(ing.quantity) * qty

        if (void_type === 'return_stock') {
          // Restore ingredient back to inventory
          const { data: ingLevel, error: levelErr } = await admin
            .from('inventory_levels')
            .select('id, quantity')
            .eq('shop_id', shop_id)
            .eq('item_id', ing.ingredient_id)
            .is('variant_id', null)
            .maybeSingle()

          console.log('[VOID DEBUG] ingLevel for', ing.ingredient_id, ':', JSON.stringify(ingLevel), 'error:', levelErr)

          if (ingLevel) {
            const { error: updateErr } = await admin
              .from('inventory_levels')
              .update({
                quantity: Number(ingLevel.quantity) + ingQty,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ingLevel.id)
            console.log('[VOID DEBUG] inventory update error:', updateErr)
          }

          const { error: movErr } = await admin.from('stock_movements').insert({
            shop_id,
            item_id: ing.ingredient_id,
            type: 'void',
            quantity: ingQty,
            reference_type: 'receipt',
            reference_id: receipt_id,
            note: `Void: ${item.item_name} x${item.quantity} — ingredient/s restored`,
          })
          console.log('[VOID DEBUG] stock_movement insert error:', movErr)
        } else {
          // Wastage — log as loss for audit trail, no inventory change (stock already dispensed at sale)
          const { error: wastageMovErr } = await admin.from('stock_movements').insert({
            shop_id,
            item_id: ing.ingredient_id,
            type: 'loss',
            quantity: -ingQty,
            reference_type: 'receipt',
            reference_id: receipt_id,
            note: `POS Wastage: ${item.item_name} x${item.quantity} — item dispensed at sale, no additional stock deducted`,
          })
          console.log('[VOID DEBUG] wastage stock_movement insert error:', wastageMovErr)
        }
      }
    } else {
      // Non-BOM item
      if (void_type === 'return_stock') {
        // Restore item back to inventory
        let levelQuery = admin
          .from('inventory_levels')
          .select('id, quantity')
          .eq('shop_id', shop_id)
          .eq('item_id', item.item_id)

        levelQuery = item.variant_id
          ? levelQuery.eq('variant_id', item.variant_id)
          : levelQuery.is('variant_id', null)

        const { data: level } = await levelQuery.maybeSingle()

        if (level) {
          await admin
            .from('inventory_levels')
            .update({
              quantity: Number(level.quantity) + qty,
              updated_at: new Date().toISOString(),
            })
            .eq('id', level.id)
        }

        await admin.from('stock_movements').insert({
          shop_id,
          item_id: item.item_id,
          variant_id: item.variant_id ?? null,
          type: 'void',
          quantity: qty,
          reference_type: 'receipt',
          reference_id: receipt_id,
          note: `Void: ${item.item_name} x${item.quantity}`,
        })
      } else {
        // Wastage — log as loss for audit trail, no inventory change (stock already dispensed at sale)
        const { error: wastageMovErr } = await admin.from('stock_movements').insert({
          shop_id,
          item_id: item.item_id,
          variant_id: item.variant_id ?? null,
          type: 'loss',
          quantity: -qty,
          reference_type: 'receipt',
          reference_id: receipt_id,
          note: `Wastage: ${item.item_name} x${item.quantity} — item was dispensed at sale, no additional stock deducted`,
        })
        console.log('[VOID DEBUG] wastage stock_movement insert error:', wastageMovErr)
      }
    }
  }

  // ── Delete financial entries tied to this receipt ──────────────────────────
  // For 'return_stock': delete everything — sale never happened, cost never incurred.
  // For 'wastage': delete revenue/discount/tax but KEEP the COGS entry —
  //   ingredients were still consumed, so the cost stands.
  if (void_type === 'wastage') {
    await admin
      .from('financial_entries')
      .delete()
      .eq('reference_type', 'receipt')
      .eq('reference_id', receipt_id)
      .eq('shop_id', shop_id)
      .in('type', ['revenue', 'discount', 'tax'])
  } else {
    // return_stock: wipe all entries including cogs
    await admin
      .from('financial_entries')
      .delete()
      .eq('reference_type', 'receipt')
      .eq('reference_id', receipt_id)
      .eq('shop_id', shop_id)
  }

  return NextResponse.json({
    success: true,
    receipt_id,
    void_type,
    items_reverted: stockableItems.length,
  })
}