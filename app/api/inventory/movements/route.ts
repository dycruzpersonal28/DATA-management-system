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

  // ── stock_movements: manual adjustments, restocks, losses ──────────────────────
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

  if (from)   movQuery = movQuery.gte('created_at', `${from}T00:00:00`)
  if (to)     movQuery = movQuery.lte('created_at', `${to}T23:59:59`)
  if (itemId) movQuery = movQuery.eq('item_id', itemId)
  if (type && type !== 'sale') movQuery = movQuery.eq('type', type)

  const { data: movements, error: movErr } = await movQuery
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  // ── inventory_logs: sale deductions + void reversals ────────────────────────────
  let logQuery = admin
    .from('inventory_logs')
    .select('id, item_id, item_name, before_qty, after_qty, change_qty, receipt_id, created_at')
    .eq('shop_id', shop_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (from)   logQuery = logQuery.gte('created_at', `${from}T00:00:00`)
  if (to)     logQuery = logQuery.lte('created_at', `${to}T23:59:59`)
  if (itemId) logQuery = logQuery.eq('item_id', itemId)

  const { data: invLogs, error: invErr } = await logQuery
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // Skip inventory_logs if filtering by non-sale type
  const useInvLogs = !type || type === 'sale'

  // ── Fetch receipt numbers for inventory_logs ──────────────────────────────────
  const invReceiptIds = [...new Set((invLogs || []).map((l: any) => l.receipt_id).filter(Boolean))]
  let receiptMap: Record<string, string> = {}
  if (invReceiptIds.length > 0) {
    const { data: receipts } = await admin
      .from('receipts')
      .select('id, receipt_number')
      .in('id', invReceiptIds)
    for (const r of receipts || []) {
      receiptMap[r.id] = r.receipt_number
    }
  }

  // ── Normalise stock_movements into UnifiedLog shape ──────────────────────────
  const movLogs = (movements || [])
    .filter(m => !type || m.type === type)
    .map((m: any) => ({
      id:             `move-${m.id}`,
      source:         m.type as 'sale' | 'restock' | 'adjustment' | 'loss',
      item_name:      m.items?.name ?? 'Unknown item',
      item_id:        m.item_id,
      receipt_number: m.reference_type === 'receipt' && m.reference_id
                        ? receiptMap[m.reference_id] ?? null
                        : null,
      change_qty:     Number(m.quantity),
      before_qty:     null,
      after_qty:      null,
      note:           m.note ?? null,
      created_at:     m.created_at,
    }))

  // ── Normalise inventory_logs into UnifiedLog shape ──────────────────────────
  const invLogsMapped = useInvLogs ? (invLogs || []).map((l: any) => {
    const isVoid = Number(l.change_qty) > 0
    return {
      id:             `inv-${l.id}`,
      source:         'sale' as const,
      item_name:      l.item_name ?? 'Unknown item',
      item_id:        l.item_id,
      receipt_number: l.receipt_id ? receiptMap[l.receipt_id] ?? null : null,
      change_qty:     Number(l.change_qty) * (isVoid ? 1 : -1),
      before_qty:     Number(l.before_qty ?? 0),
      after_qty:      Number(l.after_qty ?? 0),
      note:           isVoid
                        ? `Void: ${l.item_name}`
                        : `Sale: ${l.item_name}`,
      created_at:     l.created_at,
    }
  }) : []

  // ── Merge + sort by created_at desc ──────────────────────────────────────────
  const logs = [...movLogs, ...invLogsMapped]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 500)

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
