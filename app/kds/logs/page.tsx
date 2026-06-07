'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, TrendingUp, ChefHat, CheckCircle2 } from 'lucide-react'

type LogRow = {
  id: string
  changed_at: string
  from_status: string | null
  to_status: string
  duration_seconds: number | null
  kds_station: { name: string } | null
  kds_order: {
    receipt: {
      receipt_number: string
      created_at: string
    }
  }
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
  if (status === 'preparing') return 'bg-amber-100 text-amber-700'
  if (status === 'ready')     return 'bg-emerald-100 text-emerald-700'
  if (status === 'served')    return 'bg-indigo-100 text-indigo-700'
  return 'bg-gray-100 text-gray-600'
}

export default function KdsLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10))
  const [stationFilter, setStationFilter] = useState('')
  const [stations, setStations] = useState<{ id: string; name: string }[]>([])

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

        // Compute stats from logs
        if (data && data.length > 0) {
          const pendingToPrep = (data as any[]).filter(l => l.from_status === 'pending' && l.to_status === 'preparing' && l.duration_seconds !== null)
          const prepToReady   = (data as any[]).filter(l => l.from_status === 'preparing' && l.to_status === 'ready' && l.duration_seconds !== null)
          const readyToServed = (data as any[]).filter(l => l.from_status === 'ready' && l.to_status === 'served' && l.duration_seconds !== null)

          const avg = (arr: any[]) => arr.length === 0 ? null : Math.round(arr.reduce((s, l) => s + l.duration_seconds, 0) / arr.length)

          const avgP = avg(pendingToPrep)
          const avgPR = avg(prepToReady)
          const avgRS = avg(readyToServed)
          const avgTotal = (avgP !== null && avgPR !== null && avgRS !== null) ? avgP + avgPR + avgRS : null

          // Count unique receipts served
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
        <p className="text-sm text-gray-400 mt-0.5">Track order flow and timing from placed to served</p>
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

      {/* Logs table */}
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Time</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Receipt</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Station</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status Change</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {new Date(log.changed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
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
        )}
      </div>
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
