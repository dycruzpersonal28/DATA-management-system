'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Users, Percent, RefreshCw, ChevronDown,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type Summary = {
  totalRevenue: number
  totalCogs: number
  totalPayroll: number
  totalDiscount: number
  totalTax: number
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
  net: number
}

type Preset = 'today' | '7d' | '30d' | 'mtd' | 'custom'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date()
  const today = toDateStr(now)
  if (p === 'today') return { from: today, to: today }
  if (p === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { from: toDateStr(d), to: today }
  }
  if (p === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 29)
    return { from: toDateStr(d), to: today }
  }
  if (p === 'mtd') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today }
  }
  return { from: today, to: today }
}

function fmt(n: number, sym = '₱') {
  return `${sym}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, bg, pulse,
}: {
  label: string
  value: string
  sub?: string
  icon: any
  color: string
  bg: string
  pulse?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3 relative`}>
        <Icon className={`w-4 h-4 ${color}`} />
        {pulse && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
        )}
      </div>
      <p className="text-2xl font-semibold text-gray-900 truncate">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, sym }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-1">{shortDate(label)}</p>
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
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Set initial range
  useEffect(() => {
    const r = presetRange('7d')
    setFrom(r.from)
    setTo(r.to)
  }, [])

  // Load shop currency symbol
  useEffect(() => {
    fetch('/api/shop')
      .then(r => r.json())
      .then(d => { if (d?.currency_symbol) setSym(d.currency_symbol) })
      .catch(() => {})
  }, [])

  const load = useCallback(async (f: string, t: string) => {
    if (!f || !t) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/financial?from=${f}&to=${t}`)
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

  // Load when range changes
  useEffect(() => {
    if (from && to) load(from, to)
  }, [from, to, load])

  // Auto-refresh every 60s for live labor cost
  useEffect(() => {
    const interval = setInterval(() => {
      if (from && to) load(from, to)
    }, 60_000)
    return () => clearInterval(interval)
  }, [from, to, load])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p)
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
        <button
          onClick={() => load(from, to)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Revenue" icon={TrendingUp} color="text-green-600" bg="bg-green-50"
              value={fmt(summary.totalRevenue, sym)}
              sub={`Tax: ${fmt(summary.totalTax, sym)}`}
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
            <StatCard
              label="Profit Margin" icon={Percent} color="text-purple-600" bg="bg-purple-50"
              value={`${summary.profitMargin.toFixed(1)}%`}
              sub={`Payroll: ${fmt(summary.totalPayroll, sym)}`}
            />
          </div>

          {/* Second row: expense breakdown + live labor */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="COGS" icon={ShoppingBag} color="text-orange-600" bg="bg-orange-50"
              value={fmt(summary.totalCogs, sym)}
              sub="Cost of goods sold"
            />
            <StatCard
              label="Payroll Expense" icon={Users} color="text-pink-600" bg="bg-pink-50"
              value={fmt(summary.totalPayroll, sym)}
              sub="Finalized payroll"
            />
            <StatCard
              label="Discounts Given" icon={TrendingDown} color="text-amber-600" bg="bg-amber-50"
              value={fmt(summary.totalDiscount, sym)}
              sub="Total discounts applied"
            />
            <StatCard
              label="Labor Today (Live)" icon={Users} color="text-teal-600" bg="bg-teal-50"
              value={fmt(summary.laborToday, sym)}
              sub="Accruing from clock-ins"
              pulse
            />
          </div>

          {/* Revenue vs Expenses chart */}
          {daily.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Revenue vs Expenses — by day</h2>
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
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${sym}${v.toLocaleString()}`} width={70} />
                  <Tooltip content={<ChartTooltip sym={sym} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revenue)" />
                  <Area type="monotone" dataKey="net"     name="Net Profit" stroke="#10b981" strokeWidth={2} fill="url(#net)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Expense breakdown chart */}
          {daily.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Expense breakdown — by day</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${sym}${v.toLocaleString()}`} width={70} />
                  <Tooltip content={<ChartTooltip sym={sym} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cogs"     name="COGS"     stackId="a" fill="#f97316" radius={[0,0,0,0]} />
                  <Bar dataKey="payroll"  name="Payroll"  stackId="a" fill="#ec4899" radius={[0,0,0,0]} />
                  <Bar dataKey="discount" name="Discounts" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* P&L summary table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">P&L Summary</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">Gross Revenue</td>
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
                <tr className="hover:bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-3 text-gray-600">Cost of Goods Sold</td>
                  <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalCogs, sym)}</td>
                </tr>
                <tr className="hover:bg-gray-50 bg-blue-50/50">
                  <td className="px-4 py-3 font-semibold text-gray-800">Gross Profit</td>
                  <td className={`px-4 py-3 text-right font-semibold ${summary.grossProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {fmt(summary.grossProfit, sym)}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">Payroll Expense</td>
                  <td className="px-4 py-3 text-right text-red-500">−{fmt(summary.totalPayroll, sym)}</td>
                </tr>
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
