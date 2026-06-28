// app/api/transactions/[id]/void/route.ts
// POST /api/transactions/[id]/void
// Marks a receipt as voided, reverts inventory_levels for every receipt_item,
// and writes a stock_movements row per ingredient so the movement log reflects it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helper: resolve BOM rows for an item, preferring variant ingredients ────
// Mirrors the same logic used in /api/receipts POST so void always reverses
// exactly what the sale deducted.
async function resolveBom(
  admin: ReturnType<typeof createAdminClient>,
  itemId: string,
  variantId: string | null,
): Promise<{ ingredient_id: string; quantity: number }[]> {
  // 1. If the sold item had a variant, check item_variant_ingredients first
  if (variantId) {
    const { data: variantBom } = await admin
      .from('item_variant_ingredients')
      .select('ingredient_id, quantity')
      .eq('variant_id', variantId)

    if (variantBom && variantBom.length > 0) return variantBom
  }

  // 2. Fall back to item_ingredients (non-variant items, or variants that share
  //    the parent item's recipe)
  const { data: itemBom } = await admin
    .from('item_ingredients')
    .select('ingredient_id, quantity')
    .eq('item_id', itemId)

  return itemBom ?? []
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, name')
    .eq('auth_user_id', user.id)
    .single()
  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { shop_id }               = appUser
  const createdByName: string | null = appUser.name ?? null
  const { id: receipt_id }        = await params

  // ── Optional void metadata from request body ──────────────────────────────
  const body      = await req.json().catch(() => ({}))
  const voided_by = body.voided_by ?? null
  const voided_at = body.voided_at ?? new Date().toISOString()
  const void_note = body.void_note ?? null
  // 'return_stock' = restore inventory (default)
  // 'wastage'      = log as POS wastage, no restock
  const void_type = body.void_type ?? 'return_stock'

  // ── Fetch the receipt ─────────────────────────────────────────────────────
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

  // ── Fetch receipt items ───────────────────────────────────────────────────
  const { data: items, error: itemsErr } = await admin
    .from('receipt_items')
    .select('id, item_id, variant_id, quantity, item_name')
    .eq('receipt_id', receipt_id)

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  const receiptItems = items || []

  // ── Mark receipt as voided ────────────────────────────────────────────────
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

  // ── Revert inventory + write stock_movements ──────────────────────────────
  const stockableItems = receiptItems.filter(i => i.item_id)
  console.log('[VOID DEBUG] void_type:', void_type, '| stockableItems:', stockableItems.length)

  for (const item of stockableItems) {
    const qty       = Number(item.quantity)
    const variantId = item.variant_id ?? null

    console.log(
      '[VOID DEBUG] Processing:', item.item_name,
      '| item_id:', item.item_id,
      '| variant_id:', variantId,
      '| qty:', qty,
    )

    // ── Resolve BOM: variant ingredients first, then item ingredients ────────
    // FIX: the old code only checked item_ingredients, so variant-based items
    // (e.g. "Choco Kisses Large") never had their ingredients restored on void.
    const bomRows = await resolveBom(admin, item.item_id, variantId)
    console.log('[VOID DEBUG] BOM rows:', JSON.stringify(bomRows))

    if (bomRows.length > 0) {
      // ── BOM-based item: restore each ingredient ───────────────────────────
      for (const bom of bomRows) {
        const ingQty = Number(bom.quantity) * qty

        const { data: ingLevel } = await admin
          .from('inventory_levels')
          .select('id, quantity')
          .eq('shop_id', shop_id)
          .eq('item_id', bom.ingredient_id)
          .is('variant_id', null)
          .maybeSingle()

        const beforeQty = ingLevel ? Number(ingLevel.quantity) : 0

        if (void_type === 'return_stock') {
          const afterQty = beforeQty + ingQty

          if (ingLevel) {
            const { error: updateErr } = await admin
              .from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', ingLevel.id)
            console.log('[VOID DEBUG] ingredient inventory update error:', updateErr)
          }

          const { error: movErr } = await admin.from('stock_movements').insert({
            shop_id,
            item_id:        bom.ingredient_id,
            type:           'void',
            quantity:       ingQty,
            before_qty:     beforeQty,
            after_qty:      afterQty,
            created_by:     createdByName,
            reference_type: 'receipt',
            reference_id:   receipt_id,
            note: `Void: ${item.item_name}${variantId ? ' (variant)' : ''} x${item.quantity} — ingredient restored`,
          })
          console.log('[VOID DEBUG] stock_movement insert error:', movErr)

        } else {
          // Wastage — stock was already deducted at sale time; no further change.
          // quantity: 0 so this row is visible in the log but doesn't affect totals.
          const { error: wastageMovErr } = await admin.from('stock_movements').insert({
            shop_id,
            item_id:        bom.ingredient_id,
            type:           'loss',
            quantity:       0,
            before_qty:     beforeQty,
            after_qty:      beforeQty,
            created_by:     createdByName,
            reference_type: 'receipt',
            reference_id:   receipt_id,
            note: `POS Wastage: ${item.item_name}${variantId ? ' (variant)' : ''} x${item.quantity} — ${ingQty} units dispensed at sale, marked as waste (no additional deduction)`,
          })
          console.log('[VOID DEBUG] wastage stock_movement insert error:', wastageMovErr)
        }
      }

    } else {
      // ── Non-BOM item: restore the item/variant stock directly ─────────────
      let levelQuery = admin
        .from('inventory_levels')
        .select('id, quantity')
        .eq('shop_id', shop_id)
        .eq('item_id', item.item_id)

      levelQuery = variantId
        ? levelQuery.eq('variant_id', variantId)
        : levelQuery.is('variant_id', null)

      const { data: level } = await levelQuery.maybeSingle()
      const beforeQty = level ? Number(level.quantity) : 0

      if (void_type === 'return_stock') {
        const afterQty = beforeQty + qty

        if (level) {
          await admin
            .from('inventory_levels')
            .update({ quantity: afterQty, updated_at: new Date().toISOString() })
            .eq('id', level.id)
        }

        await admin.from('stock_movements').insert({
          shop_id,
          item_id:        item.item_id,
          variant_id:     variantId,
          type:           'void',
          quantity:       qty,
          before_qty:     beforeQty,
          after_qty:      afterQty,
          created_by:     createdByName,
          reference_type: 'receipt',
          reference_id:   receipt_id,
          note: `Void: ${item.item_name} x${item.quantity}`,
        })

      } else {
        // Wastage — stock was already deducted at sale time; no further change.
        // quantity: 0 so this row is visible in the log but doesn't affect totals.
        const { error: wastageMovErr } = await admin.from('stock_movements').insert({
          shop_id,
          item_id:        item.item_id,
          variant_id:     variantId,
          type:           'loss',
          quantity:       0,
          before_qty:     beforeQty,
          after_qty:      beforeQty,
          created_by:     createdByName,
          reference_type: 'receipt',
          reference_id:   receipt_id,
          note: `Wastage: ${item.item_name} x${qty} — dispensed at sale, marked as waste (no additional deduction)`,
        })
        console.log('[VOID DEBUG] wastage stock_movement insert error:', wastageMovErr)
      }
    }
  }

  // ── Handle financial entries ──────────────────────────────────────────────
  if (void_type === 'wastage') {
    // For wastage: revenue/tax/discount entries are removed (sale is voided),
    // but COGS is re-written with reference_type='receipt_void' so the dashboard
    // Wastage card can sum it separately from regular sale COGS.

    // 1. Fetch the original COGS entries for this receipt
    const { data: cogsEntries } = await admin
      .from('financial_entries')
      .select('type, category, amount, direction')
      .eq('reference_type', 'receipt')
      .eq('reference_id', receipt_id)
      .eq('shop_id', shop_id)
      .eq('type', 'cogs')

    // 2. Re-insert under reference_type='receipt_void' so they show on
    //    the Wastage card instead of the COGS card
    if (cogsEntries && cogsEntries.length > 0) {
      const { data: shopRow } = await admin
        .from('shops')
        .select('timezone')
        .eq('id', shop_id)
        .single()
      const entryDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: shopRow?.timezone ?? 'Asia/Manila',
      }).format(new Date())

      const wastageEntries = cogsEntries.map((e: any) => ({
        shop_id,
        entry_date:     entryDate,
        type:           e.type,
        category:       e.category,
        amount:         e.amount,
        direction:      e.direction,
        reference_type: 'receipt_void',
        reference_id:   receipt_id,
        note:           `Wastage COGS: voided receipt ${receipt_id}`,
      }))
      await admin.from('financial_entries').insert(wastageEntries)
    }

    // 3. Delete all original entries for this receipt
    await admin
      .from('financial_entries')
      .delete()
      .eq('reference_type', 'receipt')
      .eq('reference_id', receipt_id)
      .eq('shop_id', shop_id)

  } else {
    // Return to stock: remove all financial entries (sale fully reversed)
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
