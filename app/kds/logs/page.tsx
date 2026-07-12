'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, TrendingUp, ChefHat, CheckCircle2, X, Package } from 'lucide-react'

type LogRow = {
  id: string
  changed_at: string
  from_status: string | null
  to_status: string
  duration_seconds: number | null
  kds_station: { name: string } | null
  kds_order: {
    id: string
    receipt: {
      receipt_number: string
      created_at: string
    }
  }
}

type OrderItem = {
  id: string
  item_name: string
  variant_name: string | null
  quantity: number
  note: string | null
  modifiers: { name: string }[]
  addons: { name: string; quantity: number }[]
}

type OrderDetail = {
  receipt_number: string
  created_at: string
  dining_option?: { name: string }
  note?: string
  items: OrderItem[]
}

type SummaryStats = {
  total_orders: number
  avg_pending_to_preparing: number | null
  avg_preparing_to_ready: number | null
  avg_ready_to_served: number | null
  avg_total: number | null
}

function fmt(seconds: number | null) {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function statusColor(status: string) {
  if (status === 'pending')   return 'bg-red-100 text-red-700'
  if (status === 'preparing') return 'bg-amber-100 text-amber-700'
  if (status === 'ready')     return 'bg-emerald-100 text-emerald-700'
  if (status === 'served')    return 'bg-indigo-100 text-indigo-700'
  return 'bg-gray-100 text-gray-600'
}

// ── Order Detail Modal ─────────────────────────────────────────────────────────
function OrderDetailModal({
  log,
  onClose,
}: {
  log: LogRow
  onClose: () => void
}) {
  const supabase = createClient()
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const kdsOrderId = (log.kds_order as any)?.id
        const receiptNumber = (log.kds_order as any)?.receipt?.receipt_number

        // Get receipt items via kds_order → receipt
        const { data: kdsOrder } = await supabase
          .from('kds_orders')
          .select(`
            id,
            receipt:receipts(
              id,
              receipt_number,
              created_at,
              note,
              dining_options(name),
              receipt_items(
                id, item_name, variant_name, quantity, note, modifiers, addons
              )
            )
          `)
          .eq('id', kdsOrderId)
          .single()

        if (kdsOrder) {
          const receipt = (kdsOrder as any).receipt
          setDetail({
            receipt_number: receipt.receipt_number,
            created_at: receipt.created_at,
            dining_option: receipt.dining_options ?? undefined,
            note: receipt.note ?? undefined,
            items: (receipt.receipt_items ?? []).map((i: any) => ({
              ...i,
              modifiers: Array.isArray(i.modifiers) ? i.modifiers : [],
              addons: Array.isArray(i.addons) ? i.addons : [],
            })),
          })
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [log])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
              #{detail?.receipt_number ?? (log.kds_order as any)?.receipt?.receipt_number ?? '—'}
              {detail?.dining_option?.name && (
                <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {detail.dining_option.name}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {detail?.created_at
                ? new Date(detail.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : ''}
              {log.kds_station && (
                <span className="ml-2 text-indigo-500">{(log.kds_station as any).name}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status change badge */}
        <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
          {log.from_status && (
            <>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColor(log.from_status)}`}>
                {log.from_status}
              </span>
              <span className="text-gray-300 text-xs">→</span>
            </>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColor(log.to_status)}`}>
            {log.to_status}
          </span>
          {log.duration_seconds !== null && (
            <span className="ml-auto text-xs text-gray-400 tabular-nums">
              {fmt(log.duration_seconds)}
            </span>
          )}
        </div>

        {/* Order note */}
        {detail?.note && (
          <div className="px-5 pt-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700 font-medium">Order note: {detail.note}</p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
              Loading items…
            </div>
          ) : !detail || detail.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-2">
              <Package className="w-6 h-6 text-gray-300" />
              <p className="text-sm">No items found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {detail.items.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold text-gray-900">
                    <span className="text-indigo-500 font-bold mr-1.5">{item.quantity}×</span>
                    {item.item_name}
                    {item.variant_name && (
                      <span className="text-gray-400 font-normal ml-1 text-xs">({item.variant_name})</span>
                    )}
                  </p>
                  {item.modifiers?.length > 0 && (
                    <div className="mt-1 space-y-0.5 pl-4">
                      {item.modifiers.map((m: any, i: number) => (
                        <p key={i} className="text-xs text-gray-400">• {m.name}</p>
                      ))}
                    </div>
                  )}
                  {item.addons?.length > 0 && (
                    <div className="mt-0.5 pl-4 space-y-0.5">
                      {item.addons.map((a: any, i: number) => (
                        <p key={i} className="text-xs text-indigo-400">
                          + {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <p className="text-xs text-amber-500 font-medium mt-1 pl-4">
                      📝 {item.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400 text-center">
            Logged at {new Date(log.changed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function KdsLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10))
  const [stationFilter, setStationFilter] = useState('')
  const [stations, setStations] = useState<{ id: string; name: string }[]>([])
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null)

  useEffect(() => {
    async function loadStations() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return
      const { data } = await supabase.from('kds_stations').select('id, name').eq('shop_id', shop.id).order('sort_order')
      setStations(data ?? [])
    }
    loadStations()
  }, [])

  useEffect(() => {
    async function loadLogs() {
      setLoading(true)
      try {
        const start = new Date(dateFilter)
        start.setHours(0, 0, 0, 0)
        const end = new Date(dateFilter)
        end.setHours(23, 59, 59, 999)

        let query = supabase
          .from('kds_order_logs')
          .select(`
            id, changed_at, from_status, to_status, duration_seconds,
            kds_station:kds_stations(name),
            kds_order:kds_orders(
              id,
              receipt:receipts(receipt_number, created_at)
            )
          `)
          .gte('changed_at', start.toISOString())
          .lte('changed_at', end.toISOString())
          .order('changed_at', { ascending: false })
          .limit(500)

        if (stationFilter) {
          query = query.eq('kds_station_id', stationFilter)
        }

        const { data } = await query
        setLogs((data as any) ?? [])

        if (data && data.length > 0) {
          const pendingToPrep = (data as any[]).filter(l => l.from_status === 'pending' && l.to_status === 'preparing' && l.duration_seconds !== null)
          const prepToReady   = (data as any[]).filter(l => l.from_status === 'preparing' && l.to_status === 'ready' && l.duration_seconds !== null)
          const readyToServed = (data as any[]).filter(l => l.from_status === 'ready' && l.to_status === 'served' && l.duration_seconds !== null)

          const avg = (arr: any[]) => arr.length === 0 ? null : Math.round(arr.reduce((s, l) => s + l.duration_seconds, 0) / arr.length)

          const avgP  = avg(pendingToPrep)
          const avgPR = avg(prepToReady)
          const avgRS = avg(readyToServed)
          const avgTotal = (avgP !== null && avgPR !== null && avgRS !== null) ? avgP + avgPR + avgRS : null

          const servedLogs = (data as any[]).filter(l => l.to_status === 'served')
          const uniqueReceipts = new Set(servedLogs.map((l: any) => l.receipt_id)).size

          setStats({
            total_orders: uniqueReceipts,
            avg_pending_to_preparing: avgP,
            avg_preparing_to_ready: avgPR,
            avg_ready_to_served: avgRS,
            avg_total: avgTotal,
          })
        } else {
          setStats(null)
        }
      } finally {
        setLoading(false)
      }
    }
    loadLogs()
  }, [dateFilter, stationFilter])

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Kitchen Display Logs</h1>
        <p className="text-sm text-gray-400 mt-0.5">Track order flow and timing from placed to served. Click any row to see order items.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={stationFilter}
          onChange={e => setStationFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Stations</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<CheckCircle2 className="w-4 h-4 text-indigo-500" />}
            label="Orders Served"
            value={String(stats.total_orders)}
          />
          <StatCard
            icon={<Clock className="w-4 h-4 text-red-500" />}
            label="Avg: Placed → Preparing"
            value={fmt(stats.avg_pending_to_preparing)}
            sub="response time"
          />
          <StatCard
            icon={<ChefHat className="w-4 h-4 text-amber-500" />}
            label="Avg: Preparing → Ready"
            value={fmt(stats.avg_preparing_to_ready)}
            sub="cook time"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
            label="Avg Total Time"
            value={fmt(stats.avg_total)}
            sub="placed to served"
          />
        </div>
      )}

      {/* Logs table — scrollable, clickable rows */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No logs for this date</p>
            <p className="text-sm text-gray-400 mt-1">Logs are created when orders are advanced on the KDS</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Fixed header + scrollable body */}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Time</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Receipt</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Station</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status Change</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Duration</th>
                </tr>
              </thead>
            </table>
            {/* Scrollable body */}
            <div className="overflow-y-auto max-h-[520px]">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-indigo-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap w-[130px]">
                        {new Date(log.changed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 group-hover:text-indigo-600 transition-colors">
                        #{(log.kds_order as any)?.receipt?.receipt_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(log.kds_station as any)?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {log.from_status && (
                            <>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(log.from_status)}`}>
                                {log.from_status}
                              </span>
                              <span className="text-gray-300 text-xs">→</span>
                            </>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(log.to_status)}`}>
                            {log.to_status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {log.duration_seconds !== null ? (
                          <span className={
                            log.duration_seconds > 600 ? 'text-red-500 font-semibold' :
                            log.duration_seconds > 300 ? 'text-amber-500 font-semibold' :
                            'text-gray-600'
                          }>
                            {fmt(log.duration_seconds)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {selectedLog && (
        <OrderDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}