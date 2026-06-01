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

  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const itemId = searchParams.get('item_id')
  const type   = searchParams.get('type') // sale | restock | adjustment | loss

  // ── Single query: stock_movements is now the only source of truth ─────────
  let query = admin
    .from('stock_movements')
    .select(`
      id, type, quantity, before_qty, after_qty,
      note, created_at, item_id, variant_id,
      reference_type, reference_id, created_by,
      items!stock_movements_item_id_fkey(name)
    `)
    .eq('shop_id', shop_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (from)   query = query.gte('created_at', `${from}T00:00:00`)
  if (to)     query = query.lte('created_at', `${to}T23:59:59`)
  if (itemId) query = query.eq('item_id', itemId)
  if (type)   query = query.eq('type', type)

  const { data: movements, error: movErr } = await query
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  // ── Resolve receipt numbers for sale movements ────────────────────────────
  const receiptIds = [...new Set(
    (movements || [])
      .filter((m: any) => m.reference_type === 'receipt' && m.reference_id)
      .map((m: any) => m.reference_id)
  )]

  let receiptMap: Record<string, string> = {}
  let receiptStaffMap: Record<string, string> = {}
  if (receiptIds.length > 0) {
    const { data: receipts } = await admin
      .from('receipts')
      .select('id, receipt_number, app_users:employee_id(name)')
      .in('id', receiptIds)
    for (const r of receipts || []) {
      receiptMap[r.id] = r.receipt_number
      const staffName = (r.app_users as any)?.name
      if (staffName) receiptStaffMap[r.id] = staffName
    }
  }

  // ── Normalise into UnifiedLog shape ───────────────────────────────────────
  const logs = (movements || []).map((m: any) => ({
    id:             m.id,
    source:         m.type as 'sale' | 'restock' | 'adjustment' | 'loss',
    item_name:      m.items?.name ?? 'Unknown item',
    item_id:        m.item_id,
    variant_id:     m.variant_id ?? null,
    receipt_number: m.reference_type === 'receipt' && m.reference_id
                      ? receiptMap[m.reference_id] ?? null
                      : null,
    change_qty:     Number(m.quantity),
    before_qty:     m.before_qty !== null ? Number(m.before_qty) : null,
    after_qty:      m.after_qty  !== null ? Number(m.after_qty)  : null,
    note:           m.note ?? null,
    created_at:     m.created_at,
    created_by:     m.type === 'void'
                      // void: always use who actioned the void, not the original cashier
                      ? m.created_by ?? null
                      : (m.reference_type === 'receipt' && m.reference_id)
                        ? receiptStaffMap[m.reference_id] ?? m.created_by ?? null
                        : m.created_by ?? null,
  }))

  // ── Summary stats ─────────────────────────────────────────────────────────
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
