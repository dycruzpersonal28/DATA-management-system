'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Download, Search, Package, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCcw, ShoppingCart, Wrench, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO, subDays, startOfMonth } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

type LogSource = 'sale' | 'restock' | 'adjustment' | 'loss'

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
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(logs: UnifiedLog[], dateFrom: string, dateTo: string) {
  const rows: (string | number)[][] = [
    ['Date', 'Time', 'Item', 'Type', 'Receipt #', 'Change', 'Note'],
    ...logs.map(l => [
      format(parseISO(l.created_at), 'dd/MM/yyyy'),
      format(parseISO(l.created_at), 'HH:mm:ss'),
      l.item_name,
      sourceConfig[l.source].label,
      l.receipt_number ?? '—',
      l.change_qty > 0 ? `+${l.change_qty}` : l.change_qty,
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
  a.download = `inventory_log_${dateFrom}_to_${dateTo}.csv`
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
  const [logs, setLogs]         = useState<UnifiedLog[]>([])
  const [stats, setStats]       = useState<SummaryStats>({ totalIn: 0, totalOut: 0, netMovement: 0, uniqueItems: 0, mostMoved: '' })
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo]     = useState(todayStr())

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo })
      if (typeFilter) params.set('type', typeFilter)

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
  }, [dateFrom, dateTo, typeFilter])

  useEffect(() => { loadAll() }, [loadAll])

  // Client-side search filter only (type filter goes to API)
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
    const t = format(now, 'yyyy-MM-dd')
    if (preset === 'today')     { setDateFrom(t); setDateTo(t) }
    else if (preset === 'yesterday') {
      const y = format(subDays(now, 1), 'yyyy-MM-dd')
      setDateFrom(y); setDateTo(y)
    }
    else if (preset === 'week')  { setDateFrom(format(subDays(now, 6), 'yyyy-MM-dd')); setDateTo(t) }
    else if (preset === 'month') { setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd')); setDateTo(t) }
  }

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
          onClick={() => exportCSV(filtered, dateFrom, dateTo)}
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
            { label: 'Today',       key: 'today' },
            { label: 'Yesterday',   key: 'yesterday' },
            { label: 'Last 7 days', key: 'week' },
            { label: 'This month',  key: 'month' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {p.label}
            </button>
          ))}
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
              max={todayStr()}
              onChange={e => setDateTo(e.target.value)}
              className="w-40 text-sm"
            />
          </div>
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
            <p className="text-sm text-gray-400 mt-1">Try adjusting your date range or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date &amp; Time</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Item</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Receipt #</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Change</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => {
                  const cfg  = sourceConfig[log.source]
                  const Icon = cfg.icon
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">

                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm text-gray-700">
                          {format(parseISO(log.created_at), 'dd MMM yyyy')}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(parseISO(log.created_at), 'HH:mm')}
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

    </div>
  )
}
