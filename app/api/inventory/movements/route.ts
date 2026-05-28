// app/api/inventory/movements/route.ts
// GET /api/inventory/movements?from=YYYY-MM-DD&to=YYYY-MM-DD&item_id=&type=

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!appUser) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { shop_id } = appUser
  const { searchParams } = new URL(req.url)

  const from    = searchParams.get('from')
  const to      = searchParams.get('to')
  const itemId  = searchParams.get('item_id')
  const type    = searchParams.get('type')  // sale | restock | adjustment | loss

  // ── stock_movements: manual adjustments, restocks, losses, and sale deductions ──
  let movQuery = admin
    .from('stock_movements')
    .select(`
      id, type, quantity, note, created_at,
      item_id,
      items!stock_movements_item_id_fkey(name),
      reference_type, reference_id
    `)
    .eq('shop_id', shop_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (from) movQuery = movQuery.gte('created_at', `${from}T00:00:00`)
  if (to)   movQuery = movQuery.lte('created_at', `${to}T23:59:59`)
  if (itemId) movQuery = movQuery.eq('item_id', itemId)
  if (type)   movQuery = movQuery.eq('type', type)

  const { data: movements, error: movErr } = await movQuery
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  // ── For sale movements: fetch the receipt_number from receipts ──
  // Only do this if there are sale-type movements with a reference_id
  const saleMovements = (movements || []).filter(
    m => m.type === 'sale' && m.reference_type === 'receipt' && m.reference_id
  )
  const receiptIds = [...new Set(saleMovements.map(m => m.reference_id).filter(Boolean))]

  let receiptMap: Record<string, string> = {}
  if (receiptIds.length > 0) {
    const { data: receipts } = await admin
      .from('receipts')
      .select('id, receipt_number')
      .in('id', receiptIds)
    for (const r of receipts || []) {
      receiptMap[r.id] = r.receipt_number
    }
  }

  // ── Normalise into UnifiedLog shape (matches what the page expects) ──
  const logs = (movements || []).map(m => ({
    id:             `move-${m.id}`,
    source:         m.type as 'sale' | 'restock' | 'adjustment' | 'loss',
    item_name:      (m.items as any)?.name ?? 'Unknown item',
    item_id:        m.item_id,
    receipt_number: m.reference_type === 'receipt' && m.reference_id
                      ? receiptMap[m.reference_id] ?? null
                      : null,
    change_qty:     Number(m.quantity),
    before_qty:     null,   // not stored — would require event-sourcing
    after_qty:      null,
    note:           m.note ?? null,
    created_at:     m.created_at,
  }))

  // ── Summary stats ──
  const totalIn  = logs.filter(l => l.change_qty > 0).reduce((s, l) => s + l.change_qty, 0)
  const totalOut = Math.abs(logs.filter(l => l.change_qty < 0).reduce((s, l) => s + l.change_qty, 0))
  const uniqueItems = new Set(logs.map(l => l.item_name)).size

  const byItem: Record<string, number> = {}
  logs.forEach(l => {
    byItem[l.item_name] = (byItem[l.item_name] ?? 0) + Math.abs(l.change_qty)
  })
  const mostMoved = Object.entries(byItem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  return NextResponse.json({
    logs,
    stats: {
      totalIn,
      totalOut,
      netMovement: totalIn - totalOut,
      uniqueItems,
      mostMoved,
    },
  })
}
