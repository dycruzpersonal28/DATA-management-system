import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helper: current date in shop's timezone ─────────────────────────────────
function getShopDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

// ─── Helper: resolve BOM rows for an item, preferring variant ingredients ────
async function resolveBom(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
  variantId: string | null,
): Promise<{ ingredient_id: string; quantity: number }[]> {
  // If the cart item has a variantId, check item_variant_ingredients first
  if (variantId) {
    const { data: variantBom } = await supabase
      .from('item_variant_ingredients')
      .select('ingredient_id, quantity')
      .eq('variant_id', variantId)

    if (variantBom && variantBom.length > 0) return variantBom
  }

  // Fall back to item_ingredients (non-variant items, or variants that share
  // the parent item's recipe)
  const { data: itemBom } = await supabase
    .from('item_ingredients')
    .select('ingredient_id, quantity')
    .eq('item_id', itemId)

  return itemBom ?? []
}

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
    // ── 0. Fetch shop timezone ─────────────────────────────────────────────────
    const { data: shopRow } = await supabase
      .from('shops')
      .select('timezone')
      .eq('id', shop_id)
      .single()
    const entryDate = getShopDate(shopRow?.timezone ?? 'Asia/Manila')

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
    const receiptItems = items.map((item: any) => {
      // Build modifiers: preserve any existing modifiers, then append discount + PWD ID ref
      const baseModifiers: any[] = Array.isArray(item.modifiers) ? item.modifiers : []
      const discountModifiers: any[] = []
      if (item.discount_name) {
        discountModifiers.push({ type: 'discount', value: item.discount_name, amount: item.discount_amount ?? 0 })
      }
      if (item.discount_id_ref) {
        discountModifiers.push({ type: 'discount_id', value: item.discount_id_ref })
      }

      return {
        receipt_id: receipt.id,
        item_id: item.itemId,
        variant_id: item.variantId || null,
        item_name: item.name,
        unit_price: item.price,
        quantity: item.quantity,
        discount_amount: item.discount_amount ?? 0,
        tax_amount: 0,
        line_total: item.lineTotal,
        modifiers: [...baseModifiers, ...discountModifiers],
        addons: (item.addons || []).map((a: any) => ({ id: a.id, name: a.name, price: a.price, quantity: a.quantity })),
        note: item.note || null,
      }
    })
    await supabase.from('receipt_items').insert(receiptItems)

    // ── 3. Stock deduction + COGS per item ────────────────────────────────────
    const financialEntries: any[] = []
    const stockMovements: any[] = []

    for (const item of items) {
      const variantId: string | null = item.variantId || null
      console.log(`[COGS DEBUG] Processing item: ${item.name}, itemId: ${item.itemId}, variantId: ${variantId}, trackStock: ${item.trackStock}`)

      if (!item.itemId) {
        console.log(`[COGS DEBUG] Skipping — no itemId`)
        continue
      }

      // --- 3a. Resolve BOM: variant ingredients first, then item ingredients ---
      const bomRows = await resolveBom(supabase, item.itemId, variantId)

      console.log(`[COGS DEBUG] BOM rows for ${item.name} (variantId=${variantId}):`, JSON.stringify(bomRows))

      if (bomRows.length > 0) {
        // BOM-based item: deduct each ingredient from inventory_levels
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
            note: `Sale: ${item.name}${variantId ? ` (variant)` : ''} x${item.quantity}`,
          })
        }

        // COGS: ingredient unit cost × quantity used
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
        // No BOM found: fall back to direct stock deduction if trackStock is set
        console.log(`[COGS DEBUG] No BOM rows found — falling through to trackStock branch. trackStock=${item.trackStock}`)

        if (item.trackStock) {
          const { data: invRow } = await supabase
            .from('inventory_levels').select('id, quantity')
            .eq('item_id', item.itemId).eq('shop_id', shop_id)
            .eq('variant_id', variantId ?? null).maybeSingle()

          const beforeQty = invRow ? Number(invRow.quantity) : null
          const afterQty  = beforeQty !== null ? Math.max(0, beforeQty - item.quantity) : null

          if (invRow && afterQty !== null) {
            await supabase.from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          stockMovements.push({
            shop_id, item_id: item.itemId, variant_id: variantId,
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

      // ── 3b. Addon ingredient deduction ──────────────────────────────────────
      for (const addon of (item.addons || [])) {
        if (!addon.id) continue

        // Addons are never variants — always look up by item_id only.
        // Check item_ingredients first (has shop_id), then item_bom (no shop_id).
        let addonBom: { ingredient_id: string; quantity: number }[] = []

        const { data: ingRows } = await supabase
          .from('item_ingredients')
          .select('ingredient_id, quantity')
          .eq('item_id', addon.id)
          .eq('shop_id', shop_id)

        if (ingRows && ingRows.length > 0) {
          addonBom = ingRows
        } else {
          const { data: bomRows } = await supabase
            .from('item_bom')
            .select('ingredient_id, quantity')
            .eq('item_id', addon.id)
          addonBom = bomRows ?? []
        }

        for (const bom of addonBom) {
          // bom qty per unit × addon quantity × parent item quantity
          const ingredientQtyNeeded = bom.quantity * addon.quantity * item.quantity

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
            shop_id,
            item_id: bom.ingredient_id,
            type: 'sale',
            quantity: -ingredientQtyNeeded,
            before_qty: beforeQty,
            after_qty: afterQty,
            reference_type: 'receipt',
            reference_id: receipt.id,
            note: `Sale (addon): ${addon.name} x${addon.quantity} (on ${item.name} x${item.quantity})`,
          })

          // COGS for addon ingredient
          const { data: ingCostRow } = await supabase
            .from('items').select('cost').eq('id', bom.ingredient_id).maybeSingle()
          const addonCogs = ingCostRow?.cost
            ? Number(ingCostRow.cost) * ingredientQtyNeeded
            : 0
          if (addonCogs > 0) {
            financialEntries.push({
              shop_id, entry_date: entryDate, type: 'cogs', category: 'ingredient_cost',
              amount: addonCogs, direction: 'out', reference_type: 'receipt',
              reference_id: receipt.id,
              note: `COGS (addon): ${addon.name} x${addon.quantity} on ${item.name}`,
            })
          }
        }
      }
      // ── End addon ingredient deduction ──────────────────────────────────────
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

// ─── PATCH /api/receipts — void a receipt and revert stock ───────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { receipt_id, shop_id } = body

  if (!receipt_id || !shop_id) {
    return NextResponse.json({ error: 'Missing receipt_id or shop_id' }, { status: 400 })
  }

  try {
    // ── 1. Mark the receipt as voided ─────────────────────────────────────────
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .update({ status: 'voided' })
      .eq('id', receipt_id)
      .eq('shop_id', shop_id)
      .select()
      .single()

    if (receiptError) throw receiptError
    if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

    // ── 2. Load the line items that were sold ─────────────────────────────────
    const { data: soldItems, error: itemsError } = await supabase
      .from('receipt_items')
      .select('item_id, variant_id, quantity, item_name, addons')
      .eq('receipt_id', receipt_id)

    if (itemsError) throw itemsError
    if (!soldItems?.length) return NextResponse.json({ receipt })

    // ── 3. Revert stock for each line item ────────────────────────────────────
    const stockMovements: any[] = []

    for (const soldItem of soldItems) {
      const variantId: string | null = soldItem.variant_id || null

      // Resolve the same BOM that was used at sale time
      const bomRows = await resolveBom(supabase, soldItem.item_id, variantId)

      if (bomRows.length > 0) {
        // BOM-based: add ingredients back to inventory_levels
        for (const bom of bomRows) {
          const ingredientQtyToRestore = bom.quantity * soldItem.quantity
          const { data: invRow } = await supabase
            .from('inventory_levels')
            .select('id, quantity')
            .eq('item_id', bom.ingredient_id)
            .eq('shop_id', shop_id)
            .is('variant_id', null)
            .maybeSingle()

          const beforeQty = invRow ? Number(invRow.quantity) : null
          const afterQty  = beforeQty !== null ? beforeQty + ingredientQtyToRestore : null

          if (invRow && afterQty !== null) {
            await supabase.from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          stockMovements.push({
            shop_id, item_id: bom.ingredient_id, type: 'void',
            quantity: ingredientQtyToRestore, before_qty: beforeQty, after_qty: afterQty,
            reference_type: 'receipt', reference_id: receipt_id,
            note: `Void: ${soldItem.item_name}${variantId ? ` (variant)` : ''} x${soldItem.quantity}`,
          })
        }
      } else {
        // No BOM: restore direct item/variant stock
        const { data: invRow } = await supabase
          .from('inventory_levels')
          .select('id, quantity')
          .eq('item_id', soldItem.item_id)
          .eq('shop_id', shop_id)
          .eq('variant_id', variantId ?? null)
          .maybeSingle()

        const beforeQty = invRow ? Number(invRow.quantity) : null
        const afterQty  = beforeQty !== null ? beforeQty + soldItem.quantity : null

        if (invRow && afterQty !== null) {
          await supabase.from('inventory_levels')
            .update({ quantity: afterQty, updated_at: new Date().toISOString() })
            .eq('id', invRow.id)
        }

        stockMovements.push({
          shop_id, item_id: soldItem.item_id, variant_id: variantId,
          type: 'void', quantity: soldItem.quantity, before_qty: beforeQty, after_qty: afterQty,
          reference_type: 'receipt', reference_id: receipt_id,
          note: `Void: ${soldItem.item_name} x${soldItem.quantity}`,
        })
      }

      // ── Restore addon ingredients ──────────────────────────────────────────
      const addonList = Array.isArray(soldItem.addons) ? soldItem.addons : []
      for (const addon of addonList) {
        if (!addon.id) continue

        let addonBom: { ingredient_id: string; quantity: number }[] = []

        const { data: ingRows } = await supabase
          .from('item_ingredients')
          .select('ingredient_id, quantity')
          .eq('item_id', addon.id)
          .eq('shop_id', shop_id)

        if (ingRows && ingRows.length > 0) {
          addonBom = ingRows
        } else {
          const { data: bomRows } = await supabase
            .from('item_bom')
            .select('ingredient_id, quantity')
            .eq('item_id', addon.id)
          addonBom = bomRows ?? []
        }

        for (const bom of addonBom) {
          const ingredientQtyToRestore = bom.quantity * addon.quantity * soldItem.quantity

          const { data: invRow } = await supabase
            .from('inventory_levels')
            .select('id, quantity')
            .eq('shop_id', shop_id)
            .eq('item_id', bom.ingredient_id)
            .is('variant_id', null)
            .maybeSingle()

          const beforeQty = invRow ? Number(invRow.quantity) : null
          const afterQty  = beforeQty !== null ? beforeQty + ingredientQtyToRestore : null

          if (invRow && afterQty !== null) {
            await supabase.from('inventory_levels')
              .update({ quantity: afterQty, updated_at: new Date().toISOString() })
              .eq('id', invRow.id)
          }

          stockMovements.push({
            shop_id,
            item_id: bom.ingredient_id,
            type: 'void',
            quantity: ingredientQtyToRestore,
            before_qty: beforeQty,
            after_qty: afterQty,
            reference_type: 'receipt',
            reference_id: receipt_id,
            note: `Void (addon): ${addon.name} x${addon.quantity} (on ${soldItem.item_name} x${soldItem.quantity}) — ingredient restored`,
          })
        }
      }
      // ── End addon restore ──────────────────────────────────────────────────
    }

    if (stockMovements.length > 0) {
      const { error: movErr } = await supabase.from('stock_movements').insert(stockMovements)
      if (movErr) throw movErr
    }

    // ── 4. Reverse financial entries ──────────────────────────────────────────
    // Fetch shop timezone for entry_date
    const { data: shopRow } = await supabase
      .from('shops').select('timezone').eq('id', shop_id).single()
    const entryDate = getShopDate(shopRow?.timezone ?? 'Asia/Manila')

    const { data: originalEntries } = await supabase
      .from('financial_entries')
      .select('type, category, amount, direction')
      .eq('reference_type', 'receipt')
      .eq('reference_id', receipt_id)

    if (originalEntries?.length) {
      const reversalEntries = originalEntries.map((e: any) => ({
        shop_id,
        entry_date: entryDate,
        type: e.type,
        category: e.category,
        amount: e.amount,
        direction: e.direction === 'in' ? 'out' : 'in', // flip direction
        reference_type: 'receipt_void',
        reference_id: receipt_id,
        note: `Void reversal for receipt ${receipt_id}`,
      }))

      const { error: feErr } = await supabase.from('financial_entries').insert(reversalEntries)
      if (feErr) throw feErr
    }

    return NextResponse.json({ receipt, voided: true })
  } catch (err: any) {
    console.error('[PATCH /api/receipts]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
