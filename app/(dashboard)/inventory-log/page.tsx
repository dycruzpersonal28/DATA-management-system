'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Download, Search, Package, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCcw, ShoppingCart, Wrench, Trash2, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
// date-fns removed — all date/time formatting uses Intl with shop timezone

// ── Types ─────────────────────────────────────────────────────────────────────

type LogSource = 'sale' | 'restock' | 'adjustment' | 'loss' | 'void'

interface UnifiedLog {
  id: string
  source: LogSource
  item_name: string
  item_id: string
  receipt_number?: string | null
  change_qty: number
  before_qty?: number | null
  after_qty?: number | null
  note?: string | null
  created_at: string
  created_by?: string | null
}

interface SummaryStats {
  totalIn: number
  totalOut: number
  netMovement: number
  uniqueItems: number
  mostMoved: string
}

// ── Config ────────────────────────────────────────────────────────────────────

const sourceConfig: Record<LogSource, { label: string; icon: React.ElementType; badgeClass: string }> = {
  sale:       { label: 'Sale',       icon: ShoppingCart, badgeClass: 'bg-gray-100 text-gray-700' },
  restock:    { label: 'Restock',    icon: TrendingUp,   badgeClass: 'bg-emerald-50 text-emerald-700' },
  adjustment: { label: 'Adjustment', icon: Wrench,       badgeClass: 'bg-blue-50 text-blue-700' },
  loss:       { label: 'Loss',       icon: Trash2,       badgeClass: 'bg-red-50 text-red-700' },
  void:       { label: 'Void',       icon: RotateCcw,    badgeClass: 'bg-purple-50 text-purple-700' },
}

function todayStr(tz = 'Asia/Manila') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(logs: UnifiedLog[], dateFrom: string, dateTo: string, tz = 'Asia/Manila') {
  const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso))
  const rows: (string | number)[][] = [
    ['Date', 'Time', 'Item', 'Type', 'By', 'Receipt #', 'Change', 'Before Qty', 'After Qty', 'Note'],
    ...logs.map(l => [
      fmtDate(l.created_at),
      fmtTime(l.created_at),
      l.item_name,
      sourceConfig[l.source].label,
      l.created_by ?? '—',
      l.receipt_number ?? '—',
      l.change_qty > 0 ? `+${l.change_qty}` : l.change_qty,
      l.before_qty != null ? l.before_qty : '—',
      l.after_qty  != null ? l.after_qty  : '—',
      l.note ?? '—',
    ]),
  ]
  const csv = rows
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventory_log_${dateFrom || 'all'}_to_${dateTo || 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('CSV exported')
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ stats, loading }: { stats: SummaryStats; loading: boolean }) {
  const cards = [
    {
      label: 'Total Stock In',
      value: loading ? '—' : `+${stats.totalIn}`,
      icon: TrendingUp,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-600',
    },
    {
      label: 'Total Stock Out',
      value: loading ? '—' : `−${stats.totalOut}`,
      icon: TrendingDown,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      valueColor: 'text-red-500',
    },
    {
      label: 'Net Movement',
      value: loading ? '—' : (stats.netMovement >= 0 ? `+${stats.netMovement}` : `${stats.netMovement}`),
      icon: RefreshCcw,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
      valueColor: stats.netMovement >= 0 ? 'text-indigo-600' : 'text-red-500',
    },
    {
      label: 'Items Tracked',
      value: loading ? '—' : stats.uniqueItems,
      icon: Package,
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      valueColor: 'text-gray-900',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 ${c.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <c.icon className={`w-5 h-5 ${c.iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-xl font-bold ${c.valueColor} leading-tight`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        </div>
      ))}
      {!loading && stats.mostMoved && (
        <div className="col-span-2 lg:col-span-4 bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-gray-600">
            Most active item in this period:{' '}
            <span className="font-semibold text-gray-900">{stats.mostMoved}</span>
          </p>
        </div>
      )}
    </div>
  )
}

// ── Change badge ──────────────────────────────────────────────────────────────

function ChangeBadge({ qty }: { qty: number }) {
  const isPos = qty > 0
  return (
    <span className={`text-sm font-semibold tabular-nums ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
      {isPos ? `+${qty}` : qty}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryLogPage() {
  const [logs, setLogs]             = useState<UnifiedLog[]>([])
  const [stats, setStats]           = useState<SummaryStats>({ totalIn: 0, totalOut: 0, netMovement: 0, uniqueItems: 0, mostMoved: '' })
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')
  // null = no date filter (show all)
  const [dateFrom, setDateFrom]     = useState<string>('')
  const [dateTo, setDateTo]         = useState<string>('')
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null)

  // Fetch shop timezone on mount
  useEffect(() => {
    fetch('/api/shop-settings')
      .then(r => r.json())
      .then(data => { if (data?.timezone) setShopTimezone(data.timezone) })
      .catch(() => {})
  }, [])

  const tz = shopTimezone

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // Only send date params if the user has actually set them
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo)   params.set('to', dateTo)
      if (typeFilter) params.set('type', typeFilter)
      params.set('tz', tz)

      const res = await fetch(`/api/inventory/movements?${params}`)
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to load movements')
        return
      }
      const data = await res.json()
      setLogs(data.logs || [])
      setStats(data.stats)
    } catch {
      toast.error('Failed to load inventory log')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, typeFilter, tz])

  useEffect(() => { loadAll() }, [loadAll])

  // Client-side search filter
  const filtered = useMemo(() =>
    logs.filter(l => {
      if (!search) return true
      return (
        l.item_name.toLowerCase().includes(search.toLowerCase()) ||
        (l.receipt_number ?? '').toLowerCase().includes(search.toLowerCase())
      )
    }),
    [logs, search]
  )

  function setPreset(preset: string) {
    const now = new Date()
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
    const t = fmt(now)
    if (preset === 'all') {
      setDateFrom(''); setDateTo('')
    } else if (preset === 'today') {
      setDateFrom(t); setDateTo(t)
    } else if (preset === 'yesterday') {
      // Subtract 1 day in ms then format in shop tz
      const y = fmt(new Date(now.getTime() - 86400000))
      setDateFrom(y); setDateTo(y)
    } else if (preset === 'week') {
      setDateFrom(fmt(new Date(now.getTime() - 6 * 86400000))); setDateTo(t)
    } else if (preset === 'month') {
      // First day of current month in shop timezone
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit',
      }).formatToParts(now)
      const y2 = parts.find(p => p.type === 'year')?.value ?? String(now.getFullYear())
      const m  = parts.find(p => p.type === 'month')?.value ?? '01'
      setDateFrom(`${y2}-${m}-01`); setDateTo(t)
    }
  }

  const isAllTime = !dateFrom && !dateTo

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventory Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Combined view of all stock movements — sales, restocks, adjustments &amp; losses
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportCSV(filtered, dateFrom, dateTo, tz)}
          disabled={loading || filtered.length === 0}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Date controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'All time',    key: 'all' },
            { label: 'Today',       key: 'today' },
            { label: 'Yesterday',   key: 'yesterday' },
            { label: 'Last 7 days', key: 'week' },
            { label: 'This month',  key: 'month' },
          ].map(p => {
            const active =
              p.key === 'all'       ? isAllTime :
              p.key === 'today'     ? (dateFrom === todayStr(tz) && dateTo === todayStr(tz)) :
              p.key === 'yesterday' ? (dateFrom === new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() - 86400000)) && dateTo === dateFrom) :
              false
            return (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-8">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-40 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-5">To</label>
            <Input
              type="date"
              value={dateTo}
              max={todayStr(tz)}
              onChange={e => setDateTo(e.target.value)}
              className="w-40 text-sm"
            />
          </div>
          {!isAllTime && (
            <button
              onClick={() => setPreset('all')}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards stats={stats} loading={loading} />

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Search item or receipt…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All types</option>
          <option value="sale">Sales</option>
          <option value="restock">Restocks</option>
          <option value="adjustment">Adjustments</option>
          <option value="loss">Losses</option>
          <option value="void">Voids</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No movements found</p>
            <p className="text-sm text-gray-400 mt-1">
              {isAllTime ? 'No stock movements recorded yet' : 'Try adjusting your date range or filters'}
            </p>
          </div>
        ) : (
          <div style={{ maxHeight: '520px', overflowY: 'auto', overflowX: 'auto' }}>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    { label: 'Date & Time', align: 'text-left' },
                    { label: 'Item',        align: 'text-left' },
                    { label: 'Type',        align: 'text-left' },
                    { label: 'By',          align: 'text-left' },
                    { label: 'Receipt #',   align: 'text-left' },
                    { label: 'Change',      align: 'text-right' },
                    { label: 'Before Qty',  align: 'text-right' },
                    { label: 'After Qty',   align: 'text-right' },
                    { label: 'Note',        align: 'text-left' },
                  ].map((h, i) => (
                    <th
                      key={h.label}
                      className={`sticky top-0 bg-gray-50 ${h.align} text-xs font-medium text-gray-500 px-4 py-3 border-b border-gray-100${
                        i === 0 ? ' left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ' z-10'
                      }`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => {
                  const cfg  = sourceConfig[log.source] ?? sourceConfig['adjustment']
                  const Icon = cfg.icon
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >

                      {/* Date — sticky first column */}
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        <p className="text-sm text-gray-700">
                          {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(log.created_at))}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(log.created_at))}
                        </p>
                      </td>

                      {/* Item */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{log.item_name}</p>
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>

                      {/* By */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{log.created_by || '—'}</span>
                      </td>

                      {/* Receipt */}
                      <td className="px-4 py-3">
                        {log.receipt_number
                          ? <span className="text-sm text-indigo-600 font-medium">{log.receipt_number}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>

                      {/* Change */}
                      <td className="px-4 py-3 text-right">
                        <ChangeBadge qty={log.change_qty} />
                      </td>

                      {/* Before Qty */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm tabular-nums text-gray-500">
                          {log.before_qty != null ? log.before_qty : '—'}
                        </span>
                      </td>

                      {/* After Qty */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm tabular-nums text-gray-700 font-medium">
                          {log.after_qty != null ? log.after_qty : '—'}
                        </span>
                      </td>

                      {/* Note */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-xs text-gray-400 truncate block">{log.note ?? '—'}</span>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer count */}
      <p className="text-xs text-gray-400 text-right">
        {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
        {filtered.length !== logs.length && ` (filtered from ${logs.length})`}
      </p>

      {/* Log detail modal */}
      {selectedLog && (() => {
        const cfg  = sourceConfig[selectedLog.source] ?? sourceConfig['adjustment']
        const Icon = cfg.icon
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setSelectedLog(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Movement Detail</h2>
                <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Item</span>
                  <span className="font-medium text-gray-900">{selectedLog.item_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">By</span>
                  <span className="font-medium text-gray-900">{selectedLog.created_by || '—'}</span>
                </div>
                {selectedLog.receipt_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receipt #</span>
                    <span className="text-indigo-600 font-medium">{selectedLog.receipt_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Change</span>
                  <ChangeBadge qty={selectedLog.change_qty} />
                </div>
                {selectedLog.before_qty != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Before Qty</span>
                    <span className="text-gray-700 tabular-nums">{selectedLog.before_qty}</span>
                  </div>
                )}
                {selectedLog.after_qty != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">After Qty</span>
                    <span className="text-gray-700 tabular-nums font-medium">{selectedLog.after_qty}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="text-gray-700">
                    {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(selectedLog.created_at))}
                  </span>
                </div>
                {selectedLog.note && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Note</span>
                    <span className="text-gray-700 text-right">{selectedLog.note}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full mt-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
