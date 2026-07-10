'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Download, Search, Package, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCcw, ShoppingCart, Wrench, Trash2, RotateCcw, Layers,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

type LogSource = 'sale' | 'restock' | 'batch_receive' | 'adjustment' | 'loss' | 'void'

interface UnifiedLog {
  id: string
  source: LogSource
  item_name: string
  item_id: string
  // The finished product (or addon) actually sold that this ingredient
  // movement was generated for. Null for movements not tied to a sale
  // (restocks, adjustments) and for sales made before this field existed.
  product_name?: string | null
  product_id?: string | null
  receipt_number?: string | null
  change_qty: number
  before_qty?: number | null
  after_qty?: number | null
  note?: string | null
  created_at: string
  created_by?: string | null
  // Batch fields
  batch_id?: string | null
  batch_no?: string | null
  expiry_date?: string | null
  pack_size?: number | null
  pack_unit?: string | null
  qty_packs?: number | null
  qty_base?: number | null
}

interface SummaryStats {
  totalIn: number
  totalOut: number
  netMovement: number
  uniqueItems: number
  mostMoved: string
}

// A single product sold within a receipt, with its own ingredient/
// dispense breakdown. Used to nest e.g. Wings/Pizza/Fries under a combo.
interface SubItem {
  key: string
  name: string
  logs: UnifiedLog[]
}

// A row is either a single (non-transaction) log, or a group of items
// that all belong to the same POS receipt (sale or void).
type GroupedRow =
  | { isGroup: false; log: UnifiedLog }
  | {
      isGroup: true
      key: string
      source: LogSource
      receipt_number: string
      // The finished product this group's ingredients belong to.
      // Null for legacy pre-migration rows, in which case the UI falls
      // back to listing raw ingredient names like before.
      product_name: string | null
      // Other products sold in the same receipt that were bundled under
      // product_name (e.g. Wings/Pizza/Fries under a "HMB 1" combo shell).
      // Empty for a normal single-product sale.
      subItems: SubItem[]
      items: UnifiedLog[]
      created_at: string
      created_by?: string | null
      totalChange: number
      totalBefore: number | null
      totalAfter: number | null
    }

// ── Config ────────────────────────────────────────────────────────────────────

const sourceConfig: Record<LogSource, { label: string; icon: React.ElementType; badgeClass: string }> = {
  sale:          { label: 'Sale',          icon: ShoppingCart, badgeClass: 'bg-gray-100 text-gray-700' },
  restock:       { label: 'Restock',       icon: TrendingUp,   badgeClass: 'bg-emerald-50 text-emerald-700' },
  batch_receive: { label: 'Batch Receive', icon: Layers,       badgeClass: 'bg-indigo-50 text-indigo-700' },
  adjustment:    { label: 'Adjustment',    icon: Wrench,       badgeClass: 'bg-blue-50 text-blue-700' },
  loss:          { label: 'Loss',          icon: Trash2,       badgeClass: 'bg-red-50 text-red-700' },
  void:          { label: 'Void',          icon: RotateCcw,    badgeClass: 'bg-purple-50 text-purple-700' },
}

function todayStr(tz = 'Asia/Manila') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(logs: UnifiedLog[], dateFrom: string, dateTo: string, tz = 'Asia/Manila') {
  const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso))
  const rows: (string | number)[][] = [
    ['Date', 'Time', 'Item', 'Product Sold', 'Type', 'By', 'Receipt #', 'Batch No', 'Expiry', 'Change', 'Before Qty', 'After Qty', 'Note'],
    ...logs.map(l => [
      fmtDate(l.created_at),
      fmtTime(l.created_at),
      l.item_name,
      l.product_name ?? '—',
      sourceConfig[l.source]?.label ?? l.source,
      l.created_by ?? '—',
      l.receipt_number ?? '—',
      l.batch_no ?? '—',
      l.expiry_date ?? '—',
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

function AutoFitText({ text, className = '' }: { text: string | number; className?: string }) {
  const str = String(text)
  const sizeClass =
    str.length > 12 ? 'text-base' :
    str.length > 9  ? 'text-lg'   :
    str.length > 6  ? 'text-xl'   : 'text-2xl'
  return (
    <p className={`${sizeClass} font-bold leading-tight truncate ${className}`} title={str}>
      {str}
    </p>
  )
}

function SummaryCards({ stats, loading }: { stats: SummaryStats; loading: boolean }) {
  const cards = [
    { label: 'Total Stock In',  value: loading ? '—' : `+${stats.totalIn}`,  icon: TrendingUp,  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', valueColor: 'text-emerald-600' },
    { label: 'Total Stock Out', value: loading ? '—' : `\u2212${stats.totalOut}`, icon: TrendingDown, iconBg: 'bg-red-50',     iconColor: 'text-red-500',     valueColor: 'text-red-500' },
    {
      label: 'Net Movement',
      value: loading ? '—' : (stats.netMovement >= 0 ? `+${stats.netMovement}` : `${stats.netMovement}`),
      icon: RefreshCcw, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600',
      valueColor: stats.netMovement >= 0 ? 'text-indigo-600' : 'text-red-500',
    },
    { label: 'Items Tracked',   value: loading ? '—' : stats.uniqueItems, icon: Package, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', valueColor: 'text-gray-900' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 min-w-0 overflow-hidden">
          <div className={`w-10 h-10 ${c.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <c.icon className={`w-5 h-5 ${c.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <AutoFitText text={c.value} className={c.valueColor} />
            <p className="text-xs text-gray-500 mt-0.5 truncate">{c.label}</p>
          </div>
        </div>
      ))}
      {!loading && stats.mostMoved && (
        <div className="col-span-2 lg:col-span-4 bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-2 min-w-0 overflow-hidden">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-gray-600 truncate min-w-0">
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
  const [dateFrom, setDateFrom]     = useState<string>('')
  const [dateTo, setDateTo]         = useState<string>('')
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Extract<GroupedRow, { isGroup: true }> | null>(null)

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
      if (dateFrom)    params.set('from', dateFrom)
      if (dateTo)      params.set('to', dateTo)
      if (typeFilter)  params.set('type', typeFilter)
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

  const filtered = useMemo(() =>
    logs.filter(l => {
      if (!search) return true
      return (
        l.item_name.toLowerCase().includes(search.toLowerCase()) ||
        (l.product_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.receipt_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.batch_no ?? '').toLowerCase().includes(search.toLowerCase())
      )
    }),
    [logs, search]
  )

  // Group sale/void logs that share a receipt_number into a single row.
  // Restocks, batch receives, adjustments, and losses aren't tied to a POS
  // transaction, so they always stay as individual rows.
  //
  // Within a receipt, products are first bucketed by product (same as
  // before). Then we look for a "shell" product — one whose only dispense
  // log decrements itself (no recipe was found for it at sale time, so the
  // backend fell back to a direct 1:1 stock deduction; see resolveBom /
  // trackStock fallback in the receipts API). That's the signature of a
  // combo / set-meal SKU (e.g. "HMB 1") that bundles other finished items
  // (Wings, Pizza, Fries) rather than raw ingredients. When such a shell
  // exists, every other product sold in that same receipt is nested under
  // it as an included item. If no shell exists, the receipt's products stay
  // as separate rows, same as before — this only kicks in for genuine combos.
  const groupedRows = useMemo<GroupedRow[]>(() => {
    // receiptKey (source:receipt_number) -> productKey -> logs
    const byReceipt = new Map<string, Map<string, UnifiedLog[]>>()
    const singles: UnifiedLog[] = []

    for (const log of filtered) {
      if ((log.source === 'sale' || log.source === 'void') && log.receipt_number) {
        const receiptKey = `${log.source}:${log.receipt_number}`
        const productKey = log.product_id ?? log.product_name ?? log.item_id
        if (!byReceipt.has(receiptKey)) byReceipt.set(receiptKey, new Map())
        const productMap = byReceipt.get(receiptKey)!
        const arr = productMap.get(productKey)
        if (arr) arr.push(log)
        else productMap.set(productKey, [log])
      } else {
        singles.push(log)
      }
    }

    const rows: GroupedRow[] = singles.map(log => ({ isGroup: false, log }))

    for (const [receiptKey, productMap] of byReceipt) {
      const productGroups = [...productMap.entries()].map(([productKey, logs]) => ({
        productKey,
        name: logs[0].product_name ?? logs[0].item_name,
        logs: [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }))

      // A "shell": exactly one dispense log, and that log's ingredient IS
      // the sold product itself (self-decrement — no recipe expansion).
      const isShell = (g: typeof productGroups[number]) =>
        g.logs.length === 1 && g.logs[0].item_name === g.name

      const anchorIdx = productGroups.findIndex(isShell)
      const hasBundle = anchorIdx !== -1 && productGroups.length > 1

      if (hasBundle) {
        const anchor = productGroups[anchorIdx]
        const included = productGroups.filter((_, i) => i !== anchorIdx)
        const allLogs = productGroups.flatMap(g => g.logs)
        const first = [...allLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        const beforeVals = allLogs.map(i => i.before_qty).filter((v): v is number => v != null)
        const afterVals  = allLogs.map(i => i.after_qty).filter((v): v is number => v != null)
        rows.push({
          isGroup: true,
          key: receiptKey,
          source: first.source,
          receipt_number: first.receipt_number as string,
          product_name: anchor.name,
          subItems: included.map(g => ({ key: g.productKey, name: g.name, logs: g.logs })),
          items: allLogs,
          created_at: first.created_at,
          created_by: first.created_by,
          totalChange: allLogs.reduce((sum, i) => sum + i.change_qty, 0),
          totalBefore: beforeVals.length ? beforeVals.reduce((s, v) => s + v, 0) : null,
          totalAfter:  afterVals.length  ? afterVals.reduce((s, v) => s + v, 0)  : null,
        })
      } else {
        // No shell/combo detected — keep each product in this receipt as
        // its own row, same behavior as before.
        for (const g of productGroups) {
          const first = g.logs[0]
          const beforeVals = g.logs.map(i => i.before_qty).filter((v): v is number => v != null)
          const afterVals  = g.logs.map(i => i.after_qty).filter((v): v is number => v != null)
          rows.push({
            isGroup: true,
            key: `${receiptKey}:${g.productKey}`,
            source: first.source,
            receipt_number: first.receipt_number as string,
            product_name: first.product_name ?? null,
            subItems: [],
            items: g.logs,
            created_at: first.created_at,
            created_by: first.created_by,
            totalChange: g.logs.reduce((sum, i) => sum + i.change_qty, 0),
            totalBefore: beforeVals.length ? beforeVals.reduce((s, v) => s + v, 0) : null,
            totalAfter:  afterVals.length  ? afterVals.reduce((s, v) => s + v, 0)  : null,
          })
        }
      }
    }

    rows.sort((a, b) => {
      const ta = new Date(a.isGroup ? a.created_at : a.log.created_at).getTime()
      const tb = new Date(b.isGroup ? b.created_at : b.log.created_at).getTime()
      return tb - ta
    })

    return rows
  }, [filtered])

  function setPreset(preset: string) {
    const now = new Date()
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
    const t = fmt(now)
    if (preset === 'all') {
      setDateFrom(''); setDateTo('')
    } else if (preset === 'today') {
      setDateFrom(t); setDateTo(t)
    } else if (preset === 'yesterday') {
      const y = fmt(new Date(now.getTime() - 86400000))
      setDateFrom(y); setDateTo(y)
    } else if (preset === 'week') {
      setDateFrom(fmt(new Date(now.getTime() - 6 * 86400000))); setDateTo(t)
    } else if (preset === 'month') {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(now)
      const y2 = parts.find(p => p.type === 'year')?.value ?? String(now.getFullYear())
      const m  = parts.find(p => p.type === 'month')?.value ?? '01'
      setDateFrom(`${y2}-${m}-01`); setDateTo(t)
    }
  }

  const isAllTime = !dateFrom && !dateTo

  return (
    <div className="p-6 space-y-5 max-w-full overflow-x-hidden">

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
                  active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
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
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-5">To</label>
            <Input type="date" value={dateTo} max={todayStr(tz)} onChange={e => setDateTo(e.target.value)} className="w-40 text-sm" />
          </div>
          {!isAllTime && (
            <button onClick={() => setPreset('all')} className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
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
            placeholder="Search item, receipt or batch…"
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
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[
                    { label: 'Date & Time', align: 'text-left' },
                    { label: 'Item',        align: 'text-left' },
                    { label: 'Type',        align: 'text-left' },
                    { label: 'By',          align: 'text-left' },
                    { label: 'Batch / Ref', align: 'text-left' },
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
                {groupedRows.map(row => {
                  if (row.isGroup) {
                    const cfg  = sourceConfig[row.source] ?? sourceConfig['adjustment']
                    const Icon = cfg.icon
                    // Prefer the finished product name; fall back to listing
                    // raw ingredient names for legacy pre-migration rows.
                    const firstName = row.product_name ?? row.items[0].item_name
                    const extraCount = row.product_name ? 0 : row.items.length - 1
                    const isBundle = row.subItems.length > 0
                    return (
                      <tr
                        key={row.key}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedGroup(row)}
                      >
                        {/* Date — sticky first column */}
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                          <p className="text-sm text-gray-700">
                            {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(row.created_at))}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.created_at))}
                          </p>
                        </td>

                        {/* Item — summarized */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                            {firstName}{extraCount > 0 && <span className="text-gray-400 font-normal"> +{extraCount} more</span>}
                          </p>
                          <p className="text-xs text-gray-400">
                            {isBundle
                              ? `${row.subItems.length} item${row.subItems.length !== 1 ? 's' : ''} included`
                              : `${row.items.length} ingredient${row.items.length !== 1 ? 's' : ''} dispensed`}
                          </p>
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
                          <span className="text-sm text-gray-600">{row.created_by || '—'}</span>
                        </td>

                        {/* Batch / Ref */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-indigo-600 font-medium">{row.receipt_number}</span>
                        </td>

                        {/* Change — summed */}
                        <td className="px-4 py-3 text-right">
                          <ChangeBadge qty={row.totalChange} />
                        </td>

                        {/* Before Qty — summed across items in this receipt */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm tabular-nums text-gray-500">
                            {row.totalBefore != null ? row.totalBefore : '—'}
                          </span>
                          {row.totalBefore != null && <p className="text-[10px] text-gray-300">combined</p>}
                        </td>

                        {/* After Qty — summed across items in this receipt */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm tabular-nums text-gray-700 font-medium">
                            {row.totalAfter != null ? row.totalAfter : '—'}
                          </span>
                          {row.totalAfter != null && <p className="text-[10px] text-gray-300">combined</p>}
                        </td>

                        {/* Note */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <span
                            className="text-xs text-gray-500 truncate block"
                            title={isBundle ? row.subItems.map(s => s.name).join(', ') : row.items.map(i => i.item_name).join(', ')}
                          >
                            {isBundle ? row.subItems.map(s => s.name).join(', ') : row.items.map(i => i.item_name).join(', ')}
                          </span>
                        </td>
                      </tr>
                    )
                  }

                  const log = row.log
                  const cfg  = sourceConfig[log.source] ?? sourceConfig['adjustment']
                  const Icon = cfg.icon
                  const isExpired = log.expiry_date && new Date(log.expiry_date) < new Date()
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
                        <p className="text-sm font-medium text-gray-900">{log.product_name ?? log.item_name}</p>
                        {log.product_name && (
                          <p className="text-xs text-gray-400">{log.item_name}</p>
                        )}
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

                      {/* Batch / Ref */}
                      <td className="px-4 py-3">
                        {log.batch_no ? (
                          <div className="space-y-0.5">
                            <span className="text-sm text-indigo-600 font-medium">{log.batch_no}</span>
                            {log.expiry_date && (
                              <p className={`text-xs ${isExpired ? 'text-red-500' : 'text-gray-400'}`}>
                                Exp {new Date(log.expiry_date).toLocaleDateString('en-GB')}
                                {isExpired && ' ⚠'}
                              </p>
                            )}
                          </div>
                        ) : log.receipt_number ? (
                          <span className="text-sm text-indigo-600 font-medium">{log.receipt_number}</span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
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
        {groupedRows.length} row{groupedRows.length !== 1 ? 's' : ''}
        {groupedRows.length !== filtered.length && ` (${filtered.length} total movements)`}
      </p>

      {/* Log detail modal */}
      {selectedLog && (() => {
        const cfg  = sourceConfig[selectedLog.source] ?? sourceConfig['adjustment']
        const Icon = cfg.icon
        const isExpired = selectedLog.expiry_date && new Date(selectedLog.expiry_date) < new Date()
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
                {selectedLog.product_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Product Sold</span>
                    <span className="font-medium text-gray-900">{selectedLog.product_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">{selectedLog.product_name ? 'Ingredient' : 'Item'}</span>
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

                {/* Batch details block */}
                {selectedLog.batch_id && (
                  <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Batch Details
                    </p>
                    {selectedLog.batch_no && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Batch no.</span>
                        <span className="font-medium text-gray-900">{selectedLog.batch_no}</span>
                      </div>
                    )}
                    {selectedLog.expiry_date && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Expiry</span>
                        <span className={`font-medium ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
                          {new Date(selectedLog.expiry_date).toLocaleDateString('en-GB')}
                          {isExpired && ' (Expired)'}
                        </span>
                      </div>
                    )}
                    {selectedLog.qty_packs != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Packs received</span>
                        <span className="font-medium text-gray-900">
                          {selectedLog.qty_packs} {selectedLog.pack_unit || 'pcs'}
                          {selectedLog.pack_size && selectedLog.pack_size > 1 && ` × ${selectedLog.pack_size}`}
                        </span>
                      </div>
                    )}
                    {selectedLog.qty_base != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Total base units</span>
                        <span className="font-medium text-gray-900">{selectedLog.qty_base}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Receipt ref (for sales) */}
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

      {/* Grouped transaction detail modal */}
      {selectedGroup && (() => {
        const cfg  = sourceConfig[selectedGroup.source] ?? sourceConfig['adjustment']
        const Icon = cfg.icon
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setSelectedGroup(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {selectedGroup.product_name ?? 'Transaction Detail'}
                  </h2>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </span>
                </div>
                <button onClick={() => setSelectedGroup(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Receipt #</span>
                  <span className="text-indigo-600 font-medium">{selectedGroup.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">By</span>
                  <span className="font-medium text-gray-900">{selectedGroup.created_by || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="text-gray-700">
                    {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(selectedGroup.created_at))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total change</span>
                  <ChangeBadge qty={selectedGroup.totalChange} />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">
                  {selectedGroup.items.length} ingredient{selectedGroup.items.length !== 1 ? 's' : ''} dispensed
                </p>
                {selectedGroup.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                      {(item.before_qty != null || item.after_qty != null) && (
                        <p className="text-xs text-gray-400">
                          {item.before_qty != null ? item.before_qty : '—'} → {item.after_qty != null ? item.after_qty : '—'}
                        </p>
                      )}
                    </div>
                    <ChangeBadge qty={item.change_qty} />
                  </div>
                ))}
              </div>

              <button
                onClick={() => setSelectedGroup(null)}
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
