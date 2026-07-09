'use client'

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Users, Percent, RefreshCw, ChevronDown, Receipt, ExternalLink, Zap,
} from 'lucide-react'
import Link from 'next/link'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type Summary = {
  totalRevenue: number
  totalOtherIncome: number
  totalCogs: number
  totalPayroll: number
  totalDiscount: number
  totalTax: number
  totalOperatingExpenses: number   // journal expenses + labor
  grossProfit: number
  netProfit: number
  profitMargin: number
  laborToday: number
}

type DailyRow = {
  date: string
  revenue: number
  cogs: number
  payroll: number
  discount: number
  expenses: number
  net: number
}

type Preset = 'today' | '7d' | '30d' | 'mtd' | 'custom'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStrTZ(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function presetRange(p: Preset, tz: string): { from: string; to: string } {
  const now = new Date()
  const today = toDateStrTZ(now, tz)
  if (p === 'today') return { from: today, to: today }
  if (p === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { from: toDateStrTZ(d, tz), to: today }
  }
  if (p === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 29)
    return { from: toDateStrTZ(d, tz), to: today }
  }
  if (p === 'mtd') {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit',
    }).formatToParts(now)
    const year  = parts.find(x => x.type === 'year')?.value
    const month = parts.find(x => x.type === 'month')?.value
    return { from: `${year}-${month}-01`, to: today }
  }
  return { from: today, to: today }
}

function fmt(n: number | undefined | null, sym = '₱') {
  return `${sym}${(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortDate(d: string, tz: string) {
  // Use noon UTC so the date is unambiguous when converted to any timezone
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-PH', { timeZone: tz, month: 'short', day: 'numeric' })
}

// ── Auto-fit text ─────────────────────────────────────────────────────────────
// Shrinks font-size step by step until the text fits on one line within its
// container's width, instead of truncating it with an ellipsis. Re-measures
// whenever the text changes or the container is resized (e.g. sidebar
// collapsing, window resize, grid reflow at different breakpoints).
function AutoFitText({
  text, maxFontSize = 24, minFontSize = 13, className = '',
}: {
  text: string
  maxFontSize?: number
  minFontSize?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(maxFontSize)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      let size = maxFontSize
      el.style.fontSize = `${size}px`
      while (el.scrollWidth > el.clientWidth && size > minFontSize) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
      setFontSize(size)
    }

    fit()

    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, maxFontSize, minFontSize])

  return (
    <div
      ref={ref}
      className={`whitespace-nowrap overflow-hidden ${className}`}
      style={{ fontSize }}
      title={text}
    >
      {text}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, bg, pulse, href,
}: {
  label: string
  value: string
  sub?: string
  icon: any
  color: string
  bg: string
  pulse?: boolean
  href?: string
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full">
      <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3 relative`}>
        <Icon className={`w-4 h-4 ${color}`} />
        {pulse && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
        )}
      </div>
      <AutoFitText text={value} maxFontSize={24} minFontSize={13} className="font-semibold text-gray-900" />
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {href && (
        <p className="text-xs text-indigo-500 mt-1.5 flex items-center gap-0.5">
          View entries <ExternalLink className="w-3 h-3" />
        </p>
      )}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, sym, tz }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-1">{shortDate(label, tz)}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-gray-800">{fmt(p.value, sym)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const [preset, setPreset]     = useState<Preset>('7d')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [daily, setDaily]       = useState<DailyRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sym, setSym]           = useState('₱')
  const [timezone, setTimezone] = useState('UTC')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoCogsEnabled, setAutoCogsEnabled] = useState<boolean>(true)
  const [cogsToggleLoading, setCogsToggleLoading] = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [shopId, setShopId] = useState<string>('')

  useEffect(() => {
    fetch('/api/shop')
      .then(r => r.json())
      .then(d => {
        if (d?.shop?.currency_symbol) setSym(d.shop.currency_symbol)
        if (d?.shop?.id) setShopId(d.shop.id)
        if (d?.shop) setAutoCogsEnabled(d.shop.feature_auto_cogs !== false)
        const tz = d?.shop?.timezone || 'UTC'
        setTimezone(tz)
        const r = presetRange('7d', tz)
        setFrom(r.from)
        setTo(r.to)
      })
      .catch(() => {
        // Fallback: initialise dates in UTC
        const r = presetRange('7d', 'UTC')
        setFrom(r.from)
        setTo(r.to)
      })
  }, [])

  async function cleanupOrphanedEntries() {
    if (cleanupLoading) return
    setCleanupLoading(true)
    try {
      const res = await fetch('/api/finance', { method: 'DELETE' })
      const data = await res.json()
      if (data.deleted > 0) {
        await load(from, to)
      }
    } catch {}
    finally { setCleanupLoading(false) }
  }

  async function toggleAutoCogs() {
    if (cogsToggleLoading) return
    setCogsToggleLoading(true)
    const newVal = !autoCogsEnabled
    // Optimistically update UI
    setAutoCogsEnabled(newVal)
    try {
      const res = await fetch('/api/shop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_auto_cogs: newVal }),
      })
      if (!res.ok) throw new Error('Failed to update')
      await load(from, to)
    } catch {
      // Revert on error
      setAutoCogsEnabled(!newVal)
    } finally {
      setCogsToggleLoading(false)
    }
  }

  const load = useCallback(async (f: string, t: string) => {
    if (!f || !t) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/finance?from=${f}&to=${t}`)
      if (!res.ok) throw new Error('Failed to load financial data')
      const data = await res.json()
      setSummary(data.summary)
      setDaily(data.daily || [])
      setLastRefresh(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (from && to) load(from, to) }, [from, to, load])

  // Auto-refresh every 60s for live labor cost
  useEffect(() => {
    const interval = setInterval(() => { if (from && to) load(from, to) }, 60_000)
    return () => clearInterval(interval)
  }, [from, to, load])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p, timezone)
      setFrom(r.from)
      setTo(r.to)
    }
  }

  const presets: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: '30d',   label: '30 days' },
    { key: 'mtd',   label: 'This month' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Profit & Loss</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Live financial overview'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance/journal"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white border border-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" />
            Journal Entries
          </Link>

          {/* Realtime COGS toggle */}
          <button
            onClick={toggleAutoCogs}
            disabled={cogsToggleLoading || !shopId}
            title={autoCogsEnabled ? 'Realtime COGS is ON — click to disable' : 'Realtime COGS is OFF — click to enable'}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-50 ${
              autoCogsEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${autoCogsEnabled ? 'fill-emerald-500 text-emerald-500' : 'text-gray-400'}`} />
            <span>Realtime COGS</span>
            <span className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${autoCogsEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${autoCogsEnabled ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>
          <button
            onClick={cleanupOrphanedEntries}
            disabled={cleanupLoading}
            title="Remove P&L entries whose receipts have been deleted"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cleanupLoading ? 'animate-spin' : ''}`} />
            Clean P&L
          </button>
          <button
            onClick={() => load(from, to)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Date range controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {presets.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              preset === p.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date" value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date" value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <>
          {/* Row 1: top-line numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="POS Revenue" icon={TrendingUp} color="text-green-600" bg="bg-green-50"
              value={fmt(summary.totalRevenue, sym)}
              sub={`Tax: ${fmt(summary.totalTax, sym)}`}
            />
            <StatCard
              label="Other Income" icon={Receipt} color="text-emerald-600" bg="bg-emerald-50"
              value={fmt(summary.totalOtherIncome, sym)}
              sub="Venue, events, catering…"
              href="/finance/journal?type=other_income"
            />
            <StatCard
              label="Gross Profit" icon={DollarSign} color="text-blue-600" bg="bg-blue-50"
              value={fmt(summary.grossProfit, sym)}
              sub={`After COGS ${fmt(summary.totalCogs, sym)}`}
            />
            <StatCard
              label="Net Profit" icon={summary.netProfit >= 0 ? TrendingUp : TrendingDown}
              color={summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
              bg={summary.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              value={fmt(summary.netProfit, sym)}
              sub={`Margin ${summary.profitMargin.toFixed(1)}%`}
            />
          </div>

          {/* Row 2: expense breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="COGS" icon={ShoppingBag} color="text-orange-600" bg="bg-orange-50"
              value={fmt(summary.totalCogs, sym)}
              sub="Cost of goods sold"
            />
            <StatCard
              label="Payroll (finalized)" icon={Users} color="text-pink-600" bg="bg-pink-50"
              value={fmt(summary.totalPayroll, sym)}
              sub="From clock-out entries"
            />
            <StatCard
              label="Operating Expenses" icon={TrendingDown} color="text-red-600" bg="bg-red-50"
              value={fmt(summary.totalOperatingExpenses, sym)}
              sub="Utilities, rent, supplies…"
              href="/finance/journal?type=expense"
            />
            <StatCard
              label="Labor Today (Live)" icon={Users} color="text-teal-600" bg="bg-teal-50"
              value={fmt(summary.laborToday, sym)}
              sub="Accruing from clock-ins"
              pulse
            />
          </div>

          {/* Charts */}
          {daily.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Revenue vs Net Profit — by day</h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tickFormatter={d => shortDate(d, timezone)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${sym}${v.toLocaleString()}`} width={70} />
                  <Tooltip content={<ChartTooltip sym={sym} tz={timezone} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue"    stroke="#6366f1" strokeWidth={2} fill="url(#revenue)" />
                  <Area type="monotone" dataKey="net"     name="Net Profit" stroke="#10b981" strokeWidth={2} fill="url(#net)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {daily.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Expense breakdown — by day</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tickFormatter={d => shortDate(d, timezone)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${sym}${v.toLocaleString()}`} width={70} />
                  <Tooltip content={<ChartTooltip sym={sym} tz={timezone} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cogs"     name="COGS"             stackId="a" fill="#f97316" radius={[0,0,0,0]} />
                  <Bar dataKey="payroll"  name="Payroll"          stackId="a" fill="#ec4899" radius={[0,0,0,0]} />
                  <Bar dataKey="expenses" name="Oper. Expenses"   stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
                  <Bar dataKey="discount" name="Discounts"        stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Full P&L summary table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">P&L Summary</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">

                {/* Revenue section */}
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 font-medium">POS Revenue</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(summary.totalRevenue, sym)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 pl-8">— Tax collected</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(summary.totalTax, sym)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 pl-8">— Discounts given</td>
                  <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalDiscount, sym)}</td>
                </tr>
                {summary.totalOtherIncome > 0 && (
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-emerald-700 font-medium">+ Other Income</td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-medium">+{fmt(summary.totalOtherIncome, sym)}</td>
                  </tr>
                )}

                {/* COGS */}
                <tr className="hover:bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-3 text-gray-600">Cost of Goods Sold</td>
                  <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalCogs, sym)}</td>
                </tr>

                {/* Gross Profit */}
                <tr className="hover:bg-gray-50 bg-blue-50/50">
                  <td className="px-4 py-3 font-semibold text-gray-800">Gross Profit</td>
                  <td className={`px-4 py-3 text-right font-semibold ${summary.grossProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {fmt(summary.grossProfit, sym)}
                  </td>
                </tr>

                {/* Operating expenses */}
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">Payroll Expense</td>
                  <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalPayroll, sym)}</td>
                </tr>
                {summary.totalOperatingExpenses > 0 && (
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">Operating Expenses</td>
                    <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalOperatingExpenses, sym)}</td>
                  </tr>
                )}

                {/* Net Profit */}
                <tr className="hover:bg-gray-50 bg-emerald-50/50">
                  <td className="px-4 py-3 font-bold text-gray-900">Net Profit</td>
                  <td className={`px-4 py-3 text-right font-bold text-base ${summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmt(summary.netProfit, sym)}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">Profit Margin</td>
                  <td className={`px-4 py-3 text-right font-medium ${summary.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {summary.profitMargin.toFixed(1)}%
                  </td>
                </tr>

                {/* Live labor */}
                <tr className="hover:bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-3 text-teal-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-teal-400 rounded-full animate-pulse inline-block" />
                    Live Labor Today
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-teal-700">{fmt(summary.laborToday, sym)}</td>
                </tr>

              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !error && summary && summary.totalRevenue === 0 && daily.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No financial data for this period</p>
          <p className="text-sm text-gray-400 mt-1">Make some sales and finalize payroll to see your P&L</p>
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      )}
    </div>
  )
}
