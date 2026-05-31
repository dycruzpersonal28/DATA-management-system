import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  console.log('🔴 [RECEIPTS ROUTE] HIT — debug version active')
  const supabase = createAdminClient()
  const body = await req.json()

  const {
    shop_id, employee_id, customer_id, receipt_number, subtotal,
    discount_amount, tax_amount, total, payment_type_id, amount_tendered,
    change_amount, loyalty_points_earned, loyalty_points_redeemed,
    shift_id, status, items,
  } = body

  if (!shop_id || !items?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // ── 1. Insert receipt ──────────────────────────────────────────────────────
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        shop_id, employee_id: employee_id || null, customer_id: customer_id || null,
        receipt_number, subtotal, discount_amount, tax_amount: tax_amount || 0,
        total, payment_type_id: payment_type_id || null, amount_tendered, change_amount,
        loyalty_points_earned: loyalty_points_earned || 0,
        loyalty_points_redeemed: loyalty_points_redeemed || 0,
        shift_id: shift_id || null, status: status || 'completed',
      })
      .select().single()

    if (receiptError) throw receiptError

    // ── 2. Insert receipt items ────────────────────────────────────────────────
    const receiptItems = items.map((item: any) => ({
      receipt_id: receipt.id, item_id: item.itemId, variant_id: item.variantId || null,
      item_name: item.name, unit_price: item.price, quantity: item.quantity,
      discount_amount: 0, tax_amount: 0, line_total: item.lineTotal,
      modifiers: item.modifiers || [],
      addons: (item.addons || []).map((a: any) => ({ id: a.id, name: a.name, price: a.price, quantity: a.quantity })),
      note: item.note || null,
    }))
    await supabase.from('receipt_items').insert(receiptItems)

    // ── 3. Stock deduction + COGS per item ────────────────────────────────────
    const entryDate = new Date().toISOString().split('T')[0]
    const financialEntries: any[] = []
    const stockMovements: any[] = []

    for (const item of items) {
      console.log(`[COGS DEBUG] Processing item: ${item.name}, itemId: ${item.itemId}, trackStock: ${item.trackStock}`)

      if (!item.itemId) {
        console.log(`[COGS DEBUG] Skipping — no itemId`)
        continue
      }

      // --- 3a. Look up BOM ingredients for this item ---
      const { data: bomRows, error: bomErr } = await supabase
        .from('item_ingredients')
        .select('ingredient_id, quantity')
        .eq('item_id', item.itemId)

      console.log(`[COGS DEBUG] BOM rows for ${item.name}:`, JSON.stringify(bomRows), 'error:', bomErr)

      if (bomRows && bomRows.length > 0) {
        // BOM-based item: deduct ingredients from inventory_levels
        for (const bom of bomRows) {
          const ingredientQtyNeeded = bom.quantity * item.quantity
          const { data: invRow } = await supabase
            .from('inventory_levels')
            .select('id, quantity')
            .eq('item_id', bom.ingredient_id)
            .eq('shop_id', shop_id)
            .is('variant_id', null)
            .maybeSingle()

          const beforeQty = invRow ? Number(invRow.quantity) : null
          const afterQty  = beforeQty !== null ? Math.max(0, beforeQty - ingredientQtyNeeded) : null

          if (invRow && afterQty !== null) {
            await supabase.from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          stockMovements.push({
            shop_id, item_id: bom.ingredient_id, type: 'sale',
            quantity: -ingredientQtyNeeded, before_qty: beforeQty, after_qty: afterQty,
            reference_type: 'receipt', reference_id: receipt.id,
            note: `Sale: ${item.name} x${item.quantity}`,
          })
        }

        // COGS: compute from item_ingredients × ingredient costs
        const ingredientIds = bomRows.map((b: any) => b.ingredient_id)
        const { data: ingredientCosts, error: costErr } = await supabase
          .from('items')
          .select('id, cost')
          .in('id', ingredientIds)

        console.log(`[COGS DEBUG] Ingredient costs:`, JSON.stringify(ingredientCosts), 'error:', costErr)

        const costMap: Record<string, number> = {}
        for (const ic of ingredientCosts || []) {
          costMap[ic.id] = Number(ic.cost) || 0
        }

        const unitBomCost = bomRows.reduce((sum: number, b: any) => {
          return sum + (costMap[b.ingredient_id] ?? 0) * b.quantity
        }, 0)

        const cogsAmount = unitBomCost * item.quantity
        console.log(`[COGS DEBUG] unitBomCost: ${unitBomCost}, cogsAmount: ${cogsAmount}`)

        if (cogsAmount > 0) {
          financialEntries.push({
            shop_id, entry_date: entryDate, type: 'cogs', category: 'ingredient_cost',
            amount: cogsAmount, direction: 'out', reference_type: 'receipt',
            reference_id: receipt.id, note: `COGS: ${item.name} x${item.quantity}`,
          })
        } else {
          console.log(`[COGS DEBUG] cogsAmount is 0 — check if ingredients have a cost value set in items table`)
        }
      } else {
        console.log(`[COGS DEBUG] No BOM rows found — falling through to trackStock branch. trackStock=${item.trackStock}`)

        if (item.trackStock) {
          const { data: invRow } = await supabase
            .from('inventory_levels').select('id, quantity')
            .eq('item_id', item.itemId).eq('shop_id', shop_id)
            .eq('variant_id', item.variantId || null).maybeSingle()

          const beforeQty = invRow ? Number(invRow.quantity) : null
          const afterQty  = beforeQty !== null ? Math.max(0, beforeQty - item.quantity) : null

          if (invRow && afterQty !== null) {
            await supabase.from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          stockMovements.push({
            shop_id, item_id: item.itemId, variant_id: item.variantId || null,
            type: 'sale', quantity: -item.quantity, before_qty: beforeQty, after_qty: afterQty,
            reference_type: 'receipt', reference_id: receipt.id,
            note: `Sale: ${item.name} x${item.quantity}`,
          })

          const { data: itemRow } = await supabase
            .from('items').select('cost').eq('id', item.itemId).maybeSingle()

          console.log(`[COGS DEBUG] trackStock fallback — item cost:`, itemRow?.cost)

          const cogsAmount = itemRow?.cost ? Number(itemRow.cost) * item.quantity : 0
          if (cogsAmount > 0) {
            financialEntries.push({
              shop_id, entry_date: entryDate, type: 'cogs', category: 'ingredient_cost',
              amount: cogsAmount, direction: 'out', reference_type: 'receipt',
              reference_id: receipt.id, note: `COGS: ${item.name} x${item.quantity}`,
            })
          }
        }
      }
    }

    if (stockMovements.length > 0) {
      const { error: movErr } = await supabase.from('stock_movements').insert(stockMovements)
      if (movErr) throw movErr
    }

    // ── 4. Financial entries ──────────────────────────────────────────────────
    financialEntries.push({
      shop_id, entry_date: entryDate, type: 'revenue', category: 'sales',
      amount: subtotal, direction: 'in', reference_type: 'receipt',
      reference_id: receipt.id, note: `Receipt ${receipt_number}`,
    })
    if (tax_amount && tax_amount > 0) {
      financialEntries.push({
        shop_id, entry_date: entryDate, type: 'revenue', category: 'tax',
        amount: tax_amount, direction: 'in', reference_type: 'receipt',
        reference_id: receipt.id, note: `Tax: ${receipt_number}`,
      })
    }
    if (discount_amount && discount_amount > 0) {
      financialEntries.push({
        shop_id, entry_date: entryDate, type: 'expense', category: 'discount',
        amount: discount_amount, direction: 'out', reference_type: 'receipt',
        reference_id: receipt.id, note: `Discount: ${receipt_number}`,
      })
    }

    console.log(`[COGS DEBUG] Financial entries to insert:`, JSON.stringify(financialEntries.filter(e => e.type === 'cogs')))

    if (financialEntries.length > 0) {
      const { error: feErr } = await supabase.from('financial_entries').insert(financialEntries)
      console.log(`[COGS DEBUG] financial_entries insert error:`, feErr)
    }

    return NextResponse.json({ receipt, receiptItems })
  } catch (err: any) {
    console.error('[POST /api/receipts]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
