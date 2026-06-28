// app/api/transactions/[id]/revert-void/route.ts
// POST /api/transactions/[id]/revert-void
//
// Reverts a voided receipt back to "completed", undoing exactly what the void
// route applied. Detects void type automatically from existing DB records.
//
// ┌──────────────────┬────────────────────────────────────────────────────────┐
// │ Void type        │ What the original void did                             │
// ├──────────────────┼────────────────────────────────────────────────────────┤
// │ return_stock     │ • Inserted type='void' stock_movements (+qty)          │
// │                  │ • Incremented inventory_levels                         │
// │                  │ • Deleted all financial_entries for receipt             │
// ├──────────────────┼────────────────────────────────────────────────────────┤
// │ wastage          │ • Inserted type='loss', qty=0 stock_movements          │
// │                  │ • Re-inserted COGS as reference_type='receipt_void'    │
// │                  │ • Deleted all reference_type='receipt' fin. entries    │
// └──────────────────┴────────────────────────────────────────────────────────┘
//
// Revert logic:
//   return_stock → restore inventory to stored before_qty, delete void movements,
//                  recreate COGS from BOM
//   wastage      → move COGS from 'receipt_void' back to 'receipt',
//                  delete the qty=0 loss movements (no inventory change needed)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Mirrors resolveBom from the void route exactly ───────────────────────────
// Variant ingredients take priority over item ingredients.
async function resolveBom(
  admin:     ReturnType<typeof createAdminClient>,
  itemId:    string,
  variantId: string | null,
): Promise<{ ingredient_id: string; quantity: number }[]> {
  if (variantId) {
    const { data: variantBom } = await admin
      .from('item_variant_ingredients')
      .select('ingredient_id, quantity')
      .eq('variant_id', variantId)
    if (variantBom && variantBom.length > 0) return variantBom
  }
  const { data: itemBom } = await admin
    .from('item_ingredients')
    .select('ingredient_id, quantity')
    .eq('item_id', itemId)
  return itemBom ?? []
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { shop_id }              = appUser
  const createdByName            = appUser.name ?? null
  const { id: receipt_id }       = await params

  try {
    // ── 1. Load receipt ─────────────────────────────────────────────────────
    const { data: receipt, error: rErr } = await admin
      .from('receipts')
      .select('id, status, receipt_number, shop_id')
      .eq('id', receipt_id)
      .eq('shop_id', shop_id)
      .single()

    if (rErr || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    if (receipt.status !== 'voided') {
      return NextResponse.json(
        { error: `Receipt is already "${receipt.status}" — only voided receipts can be reverted` },
        { status: 400 },
      )
    }

    // ── 2. Load receipt items ───────────────────────────────────────────────
    const { data: items } = await admin
      .from('receipt_items')
      .select('id, item_id, variant_id, quantity, item_name')
      .eq('receipt_id', receipt_id)
    const receiptItems = items ?? []

    // ── 3. Detect void type from existing stock_movements ──────────────────
    //
    //  return_stock → wrote type='void'  movements with quantity > 0
    //  wastage      → wrote type='loss'  movements with qty=0 and wastage notes
    //
    const [{ data: voidMovements }, { data: wastageMovements }] = await Promise.all([
      admin
        .from('stock_movements')
        .select('id, item_id, variant_id, quantity, before_qty, after_qty')
        .eq('shop_id',        shop_id)
        .eq('type',           'void')
        .eq('reference_type', 'receipt')
        .eq('reference_id',   receipt_id),
      admin
        .from('stock_movements')
        .select('id')
        .eq('shop_id',        shop_id)
        .eq('type',           'loss')
        .eq('reference_type', 'receipt')
        .eq('reference_id',   receipt_id)
        .or('note.ilike.POS Wastage:%,note.ilike.Wastage:%'),
    ])

    const isWastageVoid = Boolean(wastageMovements && wastageMovements.length > 0)

    // ── Shop timezone for financial entry date ──────────────────────────────
    const { data: shopRow } = await admin
      .from('shops')
      .select('timezone')
      .eq('id', shop_id)
      .single()
    const entryDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: shopRow?.timezone ?? 'Asia/Manila',
    }).format(new Date())

    // ══════════════════════════════════════════════════════════════════════════
    //  WASTAGE VOID REVERT
    // ══════════════════════════════════════════════════════════════════════════
    if (isWastageVoid) {
      // The void kept stock consumed (qty=0 loss movements) and moved COGS to
      // reference_type='receipt_void'.
      //
      // To revert:
      //   1. Move COGS entries back: receipt_void → receipt
      //   2. Delete the qty=0 loss movements (no inventory adjustment needed)

      // 1. Fetch wastage COGS entries
      const { data: wastageCogsEntries } = await admin
        .from('financial_entries')
        .select('id, type, category, amount, direction')
        .eq('shop_id',        shop_id)
        .eq('type',           'cogs')
        .eq('reference_type', 'receipt_void')
        .eq('reference_id',   receipt_id)

      if (wastageCogsEntries && wastageCogsEntries.length > 0) {
        // Re-insert under reference_type='receipt' (restores them to the COGS card)
        const restoredEntries = wastageCogsEntries.map((e: any) => ({
          shop_id,
          entry_date:     entryDate,
          type:           e.type,
          category:       e.category,
          amount:         e.amount,
          direction:      e.direction,
          reference_type: 'receipt',
          reference_id:   receipt_id,
          note:           `COGS restored — void reverted (${receipt.receipt_number})`,
        }))
        const { error: insertErr } = await admin
          .from('financial_entries')
          .insert(restoredEntries)
        if (insertErr) throw new Error(`Restore COGS insert failed: ${insertErr.message}`)

        // Delete the receipt_void entries
        const { error: delErr } = await admin
          .from('financial_entries')
          .delete()
          .in('id', wastageCogsEntries.map((e: any) => e.id))
        if (delErr) throw new Error(`Delete wastage COGS failed: ${delErr.message}`)
      } else {
        // Edge case: wastage COGS entries are missing — recreate from BOM
        await recreateCogsFromBom(admin, receiptItems, receipt_id, shop_id, entryDate, createdByName, receipt.receipt_number)
      }

      // 2. Delete the type='loss' qty=0 wastage stock_movements
      //    (qty was 0, so inventory levels don't need adjusting)
      if (wastageMovements && wastageMovements.length > 0) {
        const { error: delMovErr } = await admin
          .from('stock_movements')
          .delete()
          .in('id', wastageMovements.map((m: any) => m.id))
        if (delMovErr) throw new Error(`Delete wastage movements failed: ${delMovErr.message}`)
      }

    // ══════════════════════════════════════════════════════════════════════════
    //  RETURN-TO-STOCK VOID REVERT
    // ══════════════════════════════════════════════════════════════════════════
    } else {
      // The void incremented inventory and wrote type='void' stock_movements
      // that stored before_qty and after_qty.
      //
      // To revert:
      //   1. Restore inventory to stored before_qty (exact, uses the logged value)
      //   2. Delete the type='void' movements
      //   3. Recreate COGS entries (void deleted them)

      if (voidMovements && voidMovements.length > 0) {
        for (const mov of voidMovements) {
          // Use the stored before_qty for pixel-perfect restoration —
          // this is exactly the value that existed before the void ran.
          const restoreQty = Number(mov.before_qty ?? 0)

          let levelQuery = admin
            .from('inventory_levels')
            .select('id, quantity')
            .eq('shop_id', shop_id)
            .eq('item_id', mov.item_id)

          levelQuery = mov.variant_id
            ? levelQuery.eq('variant_id', mov.variant_id)
            : levelQuery.is('variant_id', null)

          const { data: level } = await levelQuery.maybeSingle()
          if (level) {
            const { error: invErr } = await admin
              .from('inventory_levels')
              .update({ quantity: restoreQty, updated_at: new Date().toISOString() })
              .eq('id', level.id)
            if (invErr) throw new Error(`Inventory restore failed for item ${mov.item_id}: ${invErr.message}`)
          }
        }

        // Delete the void stock_movements
        const { error: delMovErr } = await admin
          .from('stock_movements')
          .delete()
          .in('id', voidMovements.map((m: any) => m.id))
        if (delMovErr) throw new Error(`Delete void movements failed: ${delMovErr.message}`)

      } else {
        // Fallback: no type='void' movements found (unusual edge case).
        // Re-consume ingredients via BOM, mirroring what the original sale did.
        await deductInventoryFromBom(admin, receiptItems, receipt_id, shop_id, createdByName)
      }

      // Recreate COGS (the void deleted all financial_entries for this receipt)
      await recreateCogsFromBom(admin, receiptItems, receipt_id, shop_id, entryDate, createdByName, receipt.receipt_number)
    }

    // ── 4. Restore receipt to completed ────────────────────────────────────
    const { error: statusErr } = await admin
      .from('receipts')
      .update({
        status:    'completed',
        voided_by: null,
        voided_at: null,
        void_note: null,
      })
      .eq('id', receipt_id)
    if (statusErr) throw new Error(`Status update failed: ${statusErr.message}`)

    return NextResponse.json({
      success:            true,
      receipt_id,
      receipt_number:     receipt.receipt_number,
      void_type_reverted: isWastageVoid ? 'wastage' : 'return_stock',
    })

  } catch (err: any) {
    console.error('[revert-void]', err)
    return NextResponse.json(
      { error: err.message || 'Unexpected error reverting void' },
      { status: 500 },
    )
  }
}

// ── Recreate COGS financial_entries from BOM ingredient costs ────────────────
//
// Idempotent — skips if a 'receipt' COGS entry already exists for this receipt.
// Mirrors the cost calculation from the original receipt POST.
//
async function recreateCogsFromBom(
  admin:          ReturnType<typeof createAdminClient>,
  receiptItems:   any[],
  receipt_id:     string,
  shop_id:        string,
  entryDate:      string,
  createdByName:  string | null,
  receiptNumber:  string,
) {
  // Idempotency guard
  const { data: existing } = await admin
    .from('financial_entries')
    .select('id')
    .eq('shop_id',        shop_id)
    .eq('type',           'cogs')
    .eq('reference_type', 'receipt')
    .eq('reference_id',   receipt_id)
    .maybeSingle()
  if (existing) return

  let totalCogs = 0

  for (const ri of receiptItems) {
    if (!ri.item_id) continue
    const bomRows = await resolveBom(admin, ri.item_id, ri.variant_id ?? null)
    for (const bom of bomRows) {
      const { data: ingItem } = await admin
        .from('items')
        .select('cost')
        .eq('id', bom.ingredient_id)
        .maybeSingle()
      const cost  = Number((ingItem as any)?.cost ?? 0)
      totalCogs  += cost * Number(bom.quantity) * Number(ri.quantity)
    }
  }

  if (totalCogs > 0) {
    await admin.from('financial_entries').insert({
      shop_id,
      entry_date:     entryDate,
      type:           'cogs',
      direction:      'out',
      amount:         totalCogs,
      reference_type: 'receipt',
      reference_id:   receipt_id,
      note:           `COGS reinstated — void reverted (${receiptNumber})`,
    })
  }
}

// ── Fallback: deduct inventory via BOM when void movements aren't found ──────
//
// Used when returning from a void that left no type='void' stock_movements
// (shouldn't happen in normal flow, but handles edge cases safely).
//
async function deductInventoryFromBom(
  admin:         ReturnType<typeof createAdminClient>,
  receiptItems:  any[],
  receipt_id:    string,
  shop_id:       string,
  createdByName: string | null,
) {
  for (const ri of receiptItems) {
    if (!ri.item_id) continue
    const qty       = Number(ri.quantity)
    const variantId = ri.variant_id ?? null
    const bomRows   = await resolveBom(admin, ri.item_id, variantId)

    if (bomRows.length > 0) {
      // BOM item — consume each ingredient
      for (const bom of bomRows) {
        const ingQty = Number(bom.quantity) * qty

        const { data: level } = await admin
          .from('inventory_levels')
          .select('id, quantity')
          .eq('shop_id', shop_id)
          .eq('item_id', bom.ingredient_id)
          .is('variant_id', null)
          .maybeSingle()

        const beforeQty = level ? Number(level.quantity) : 0
        const afterQty  = Math.max(0, beforeQty - ingQty)

        if (level) {
          await admin
            .from('inventory_levels')
            .update({ quantity: afterQty, updated_at: new Date().toISOString() })
            .eq('id', level.id)
        }

        await admin.from('stock_movements').insert({
          shop_id,
          item_id:        bom.ingredient_id,
          type:           'sale',
          quantity:       ingQty,
          before_qty:     beforeQty,
          after_qty:      afterQty,
          created_by:     createdByName,
          reference_type: 'receipt',
          reference_id:   receipt_id,
          note: `Sale (void reverted): ${ri.item_name}${variantId ? ' (variant)' : ''} x${qty}`,
        })
      }
    } else {
      // Non-BOM item — consume directly from item/variant inventory
      let levelQuery = admin
        .from('inventory_levels')
        .select('id, quantity')
        .eq('shop_id', shop_id)
        .eq('item_id', ri.item_id)
      levelQuery = variantId
        ? levelQuery.eq('variant_id', variantId)
        : levelQuery.is('variant_id', null)

      const { data: level } = await levelQuery.maybeSingle()
      const beforeQty = level ? Number(level.quantity) : 0
      const afterQty  = Math.max(0, beforeQty - qty)

      if (level) {
        await admin
          .from('inventory_levels')
          .update({ quantity: afterQty, updated_at: new Date().toISOString() })
          .eq('id', level.id)
      }

      await admin.from('stock_movements').insert({
        shop_id,
        item_id:        ri.item_id,
        variant_id:     variantId,
        type:           'sale',
        quantity:       qty,
        before_qty:     beforeQty,
        after_qty:      afterQty,
        created_by:     createdByName,
        reference_type: 'receipt',
        reference_id:   receipt_id,
        note: `Sale (void reverted): ${ri.item_name} x${qty}`,
      })
    }
  }
}