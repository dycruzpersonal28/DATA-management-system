import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json()

  const {
    shop_id,
    employee_id,
    customer_id,
    receipt_number,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    payment_type_id,
    amount_tendered,
    change_amount,
    loyalty_points_earned,
    loyalty_points_redeemed,
    shift_id,
    status,
    items, // cart items array
  } = body

  if (!shop_id || !items?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // ── 1. Insert receipt ──────────────────────────────────────────────────────
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        shop_id,
        employee_id: employee_id || null,
        customer_id: customer_id || null,
        receipt_number,
        subtotal,
        discount_amount,
        tax_amount: tax_amount || 0,
        total,
        payment_type_id: payment_type_id || null,
        amount_tendered,
        change_amount,
        loyalty_points_earned: loyalty_points_earned || 0,
        loyalty_points_redeemed: loyalty_points_redeemed || 0,
        shift_id: shift_id || null,
        status: status || 'completed',
      })
      .select()
      .single()

    if (receiptError) throw receiptError

    // ── 2. Insert receipt items ────────────────────────────────────────────────
    const receiptItems = items.map((item: any) => ({
      receipt_id: receipt.id,
      item_id: item.itemId,
      variant_id: item.variantId || null,
      item_name: item.name,
      unit_price: item.price,
      quantity: item.quantity,
      discount_amount: 0,
      tax_amount: 0,
      line_total: item.lineTotal,
      modifiers: item.modifiers || [],
      addons: (item.addons || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        quantity: a.quantity,
      })),
      note: item.note || null,
    }))

    await supabase.from('receipt_items').insert(receiptItems)

    // ── 3. Stock deduction + COGS per item ────────────────────────────────────
    const entryDate = new Date().toISOString().split('T')[0]
    const financialEntries: any[] = []

    for (const item of items) {
      if (!item.itemId) continue

      // --- 3a. Look up BOM ingredients for this item ---
      const { data: bomRows } = await supabase
        .from('item_ingredients')
        .select('ingredient_id, quantity')
        .eq('item_id', item.itemId)
        .eq('shop_id', shop_id)

      if (bomRows && bomRows.length > 0) {
        // BOM-based item: deduct ingredients from inventory_levels
        for (const bom of bomRows) {
          const ingredientQtyNeeded = bom.quantity * item.quantity

          // Deduct from inventory_levels (ingredient stock)
          const { data: invRow } = await supabase
            .from('inventory_levels')
            .select('id, quantity')
            .eq('item_id', bom.ingredient_id)
            .eq('shop_id', shop_id)
            .is('variant_id', null)
            .maybeSingle()

          if (invRow) {
            const newQty = Math.max(0, invRow.quantity - ingredientQtyNeeded)
            await supabase
              .from('inventory_levels')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          // Write stock_movement row for each ingredient deducted
          await supabase.from('stock_movements').insert({
            shop_id,
            item_id: bom.ingredient_id,
            type: 'sale',
            quantity: -ingredientQtyNeeded,
            reference_type: 'receipt',
            reference_id: receipt.id,
            note: `Sale: ${item.name} x${item.quantity}`,
          })
        }

        // COGS: compute from item_ingredients × ingredient costs
        const ingredientIds = bomRows.map((b: any) => b.ingredient_id)
        const { data: ingredientCosts } = await supabase
          .from('items')
          .select('id, cost')
          .in('id', ingredientIds)

        const costMap: Record<string, number> = {}
        for (const ic of ingredientCosts || []) {
          costMap[ic.id] = Number(ic.cost) || 0
        }

        const unitBomCost = bomRows.reduce((sum: number, b: any) => {
          return sum + (costMap[b.ingredient_id] ?? 0) * b.quantity
        }, 0)

        const cogsAmount = unitBomCost * item.quantity

        if (cogsAmount > 0) {
          financialEntries.push({
            shop_id,
            entry_date: entryDate,
            type: 'cogs',
            category: 'ingredient_cost',
            amount: cogsAmount,
            direction: 'out',
            reference_type: 'receipt',
            reference_id: receipt.id,
            note: `COGS: ${item.name} x${item.quantity}`,
          })
        }
      } else if (item.trackStock) {
        // Non-BOM item: deduct the item itself from inventory_levels
        const { data: invRow } = await supabase
          .from('inventory_levels')
          .select('id, quantity')
          .eq('item_id', item.itemId)
          .eq('shop_id', shop_id)
          .eq('variant_id', item.variantId || null)
          .maybeSingle()

        if (invRow) {
          const newQty = Math.max(0, invRow.quantity - item.quantity)
          await supabase
            .from('inventory_levels')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', invRow.id)
        }

        await supabase.from('stock_movements').insert({
          shop_id,
          item_id: item.itemId,
          variant_id: item.variantId || null,
          type: 'sale',
          quantity: -item.quantity,
          reference_type: 'receipt',
          reference_id: receipt.id,
          note: `Sale: ${item.name} x${item.quantity}`,
        })

        // COGS from items.cost fallback
        const { data: itemRow } = await supabase
          .from('items')
          .select('cost')
          .eq('id', item.itemId)
          .maybeSingle()

        const cogsAmount = itemRow?.cost ? Number(itemRow.cost) * item.quantity : 0
        if (cogsAmount > 0) {
          financialEntries.push({
            shop_id,
            entry_date: entryDate,
            type: 'cogs',
            category: 'ingredient_cost',
            amount: cogsAmount,
            direction: 'out',
            reference_type: 'receipt',
            reference_id: receipt.id,
            note: `COGS: ${item.name} x${item.quantity}`,
          })
        }
      }
    }

    // ── 4. Financial entries: revenue + tax + discount ────────────────────────

    // Revenue (sales)
    financialEntries.push({
      shop_id,
      entry_date: entryDate,
      type: 'revenue',
      category: 'sales',
      amount: subtotal,
      direction: 'in',
      reference_type: 'receipt',
      reference_id: receipt.id,
      note: `Receipt ${receipt_number}`,
    })

    // Tax
    if (tax_amount && tax_amount > 0) {
      financialEntries.push({
        shop_id,
        entry_date: entryDate,
        type: 'revenue',
        category: 'tax',
        amount: tax_amount,
        direction: 'in',
        reference_type: 'receipt',
        reference_id: receipt.id,
        note: `Tax: ${receipt_number}`,
      })
    }

    // Discount
    if (discount_amount && discount_amount > 0) {
      financialEntries.push({
        shop_id,
        entry_date: entryDate,
        type: 'expense',
        category: 'discount',
        amount: discount_amount,
        direction: 'out',
        reference_type: 'receipt',
        reference_id: receipt.id,
        note: `Discount: ${receipt_number}`,
      })
    }

    if (financialEntries.length > 0) {
      await supabase.from('financial_entries').insert(financialEntries)
    }

    return NextResponse.json({ receipt, receiptItems })
  } catch (err: any) {
    console.error('[POST /api/receipts]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
