'use client'

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Percent,
  RefreshCw, X, Receipt, Package, Eye,
  Printer, Trash2, AlertTriangle, ChevronRight,
  BarChart2, ArrowUpCircle, CreditCard,
  Banknote, Smartphone, ArrowDownCircle, Lock, Flame, Warehouse, RotateCcw,
  Calendar, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRole = 'owner' | 'Owner' | 'manager' | 'Manager' | 'cashier' | 'Cashier' | 'staff' | 'Staff' | null

type Summary = {
  grossSales: number
  cogs: number
  cashouts: number
  discounts: number
  taxes: number
  netSales: number
  netAfterCogs: number
  wastageTotal: number
  wastageItems: { name: string; qty: number; total: number }[]
  wastageReceipts: {
    receipt_number: string
    date: string
    cogsAmount: number
    items: { name: string; qty: number; lineTotal: number }[]
  }[]
  paymentBreakdown: { name: string; amount: number; count: number }[]
  cashoutBreakdown: { note: string; amount: number; date: string; shift: string }[]
  discountBreakdown: { receipt_number: string; amount: number; date: string }[]
}

type ReceiptRow = {
  id: string
  receipt_number: string
  transaction_number: string | null
  cashier: string
  shift_label: string
  shift_id: string | null
  created_at: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_name: string
  status: string
  items: ReceiptItem[]
}

type ReceiptItem = {
  id: string
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  modifiers: any[]
  addons: any[]
  note: string | null
  variant_id: string | null
  ingredients: { name: string; quantity: number }[]
}

type CashMovementRow = {
  id: string
  type: 'cash_in' | 'cash_out'
  amount: number
  note: string
  created_at: string
  shift_label: string
  cashier: string
}

type TopItem = { name: string; qty: number; revenue: number }
type ChartPoint = { label: string; sales: number; txCount: number }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
// Returns YYYY-MM-DD in the given IANA timezone (or UTC if not supplied)
function toDateStrTz(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(d)
}
// Legacy helper — kept for non-timezone-sensitive uses
function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function todayTz(tz?: string) { return toDateStrTz(new Date(), tz) }
// Formats a YYYY-MM-DD string for display (e.g. "Jul 11, 2026").
// Parses as UTC to avoid the date shifting by a day in negative-offset timezones.
function fmtDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(dt)
}
function startOfMonthTz(tz?: string): string {
  const now = new Date()
  // Get current year/month in shop timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  return `${y}-${m}-01`
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// Generates the same per-shift reference number format used in the shift report page
function buildRefNumber(date: Date, sequence: number): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const y = String(date.getFullYear())
  return `${m}${d}${y}-${String(sequence).padStart(5, '0')}`
}
function canSeeCogs(role: UserRole) {
  const r = role?.toLowerCase()
  return r === 'owner' || r === 'manager'
}

// ── Sparkline / Sales Timeline Chart (pure SVG, no deps) ─────────────────────
function SalesChart({ data, currencySymbol }: { data: ChartPoint[]; currencySymbol: string }) {
  const W = 900; const H = 160; const PAD = { t: 16, r: 16, b: 36, l: 64 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  if (!data.length) return null
  const maxSales = Math.max(...data.map(d => d.sales), 1)
  const pts = data.map((d, i) => ({
    x: PAD.l + (i / Math.max(data.length - 1, 1)) * iW,
    y: PAD.t + iH - (d.sales / maxSales) * iH,
    ...d,
  }))
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + iH).toFixed(1)} L${PAD.l},${(PAD.t + iH).toFixed(1)} Z`
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxSales * f, y: PAD.t + iH - f * iH }))

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 340 }}>
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              {t.v >= 1000 ? `${(t.v / 1000).toFixed(0)}k` : t.v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#salesGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Points + x labels */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2" />
            {/* Tooltip on hover via title */}
            <title>{p.label}: {fmt(p.sales)} ({p.txCount} tx)</title>
            {/* X labels - show every nth to avoid crowding */}
            {(data.length <= 14 || i % Math.ceil(data.length / 14) === 0) && (
              <text x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8"
                transform={data.length > 10 ? `rotate(-35,${p.x},${H - 6})` : undefined}>
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Stock Value Modal ─────────────────────────────────────────────────────────
function StockValueModal({
  items, total, onClose,
}: {
  items: { name: string; qty: number; cost: number; value: number }[]
  total: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-teal-50">
          <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Raw Stock Value</h3>
            <p className="text-xs text-gray-500">Cost × quantity on hand</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No Raw Stocks items with cost assigned</p>
          )}
          {items.map((item, i) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0
            return (
              <div key={i} className="p-3 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="text-sm font-medium text-gray-800 truncate pr-2">{item.name}</span>
                  <span className="text-sm font-bold text-teal-700 flex-shrink-0">
                    {`₱${item.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400">
                  {item.qty} units × ₱{item.cost.toFixed(2)} cost · {pct.toFixed(1)}% of total
                </p>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Total Stock Value</span>
          <span className="text-base font-bold text-teal-700">
            {`₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Auto-fit text ─────────────────────────────────────────────────────────────
// Shrinks font-size step by step until the text fits on one line within its
// container's width, instead of clipping or overflowing. Re-measures whenever
// the text changes or the container is resized (sidebar collapse, window
// resize, grid reflow at different breakpoints).
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color, bg, icon: Icon, onClick, clickable, locked,
}: {
  label: string; value: string; sub?: string
  color: string; bg: string; icon: any
  onClick?: () => void; clickable?: boolean; locked?: boolean
}) {
  if (locked) {
    return (
      <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-5 text-left w-full relative overflow-hidden">
        <div className="absolute inset-0 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 z-10">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <Lock className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-xs text-gray-400 font-medium">Owner / Manager only</p>
        </div>
        <div className="opacity-10 pointer-events-none">
          <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <p className="text-2xl font-bold text-gray-300">₱•••••</p>
          <p className="text-xs text-gray-400 mt-1">{label}</p>
        </div>
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={`bg-white rounded-2xl border border-gray-200 p-5 text-left w-full overflow-hidden transition-all ${
        clickable ? 'hover:shadow-md hover:border-gray-300 active:scale-[0.98] cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {clickable && <ChevronRight className="w-4 h-4 text-gray-300 mt-1" />}
      </div>
      <AutoFitText text={value} maxFontSize={24} minFontSize={13} className={`font-bold ${color} tracking-tight`} />
      <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </button>
  )
}

// ── Payment Breakdown Modal ────────────────────────────────────────────────────
function PaymentModal({ breakdown, total, onClose }: {
  breakdown: { name: string; amount: number; count: number }[]
  total: number; onClose: () => void
}) {
  const icons: Record<string, any> = {
    Cash: Banknote, GCash: Smartphone, Card: CreditCard,
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-emerald-50">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Gross Sales Breakdown</h3>
            <p className="text-xs text-gray-500">By payment method</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {breakdown.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No sales in this period</p>
          )}
          {breakdown.map(b => {
            const IconComp = icons[b.name] || CreditCard
            const pct = total > 0 ? (b.amount / total) * 100 : 0
            return (
              <div key={b.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <IconComp className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-800">{b.name}</span>
                    <span className="text-sm font-bold text-emerald-700">{fmt(b.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{b.count} transaction{b.count !== 1 ? 's' : ''} · {pct.toFixed(1)}%</p>
                </div>
              </div>
            )
          })}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-base font-bold text-gray-900">{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Cashout Breakdown Modal ───────────────────────────────────────────────────
function CashoutModal({ breakdown, total, onClose }: {
  breakdown: { note: string; amount: number; date: string; shift: string }[]
  total: number; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-orange-50">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
            <ArrowUpCircle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cash Out Expenses</h3>
            <p className="text-xs text-gray-500">Recorded during shifts</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {breakdown.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No cash outs in this period</p>
          )}
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <ArrowUpCircle className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium text-gray-800 truncate pr-2">{b.note || 'Cash out'}</p>
                  <span className="text-sm font-bold text-red-600 flex-shrink-0">−{fmt(b.amount)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(b.date)} · {b.shift}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Total Cash Outs</span>
          <span className="text-base font-bold text-red-600">−{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Discount Modal ────────────────────────────────────────────────────────────
function DiscountModal({ breakdown, total, taxes, onClose }: {
  breakdown: { receipt_number: string; amount: number; date: string }[]
  total: number; taxes: number; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-purple-50">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Percent className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Taxes & Discounts</h3>
            <p className="text-xs text-gray-500">Per transaction</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          <div className="flex justify-between text-sm px-1 mb-3">
            <span className="text-gray-500">Total taxes collected</span>
            <span className="font-semibold text-gray-800">{fmt(taxes)}</span>
          </div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1 mb-2">Discounts given</p>
          {breakdown.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No discounts in this period</p>
          )}
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Percent className="w-4 h-4 text-purple-500" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-800">{b.receipt_number}</span>
                  <span className="text-sm font-bold text-purple-700">−{fmt(b.amount)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(b.date)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Total Discounts</span>
          <span className="text-base font-bold text-purple-700">−{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Receipt Detail Modal ──────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose, currencySymbol }: {
  receipt: ReceiptRow; onClose: () => void; currencySymbol: string
}) {
  const sym = currencySymbol || '₱'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-indigo-50">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Receipt className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{receipt.receipt_number}</h3>
            <p className="text-xs text-gray-500">{fmtDateTime(receipt.created_at)} · {receipt.cashier}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {receipt.items.map((item, i) => (
            <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-start justify-between px-3 py-2.5 bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.item_name}</p>
                  {item.note && <p className="text-xs text-indigo-600 mt-0.5 italic">"{item.note}"</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-bold text-gray-900">{sym}{item.line_total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">×{item.quantity} @ {sym}{item.unit_price.toFixed(2)}</p>
                </div>
              </div>
              {item.addons && item.addons.length > 0 && (
                <div className="px-3 py-2 border-t border-gray-100 space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Add-ons</p>
                  {item.addons.map((a: any, j: number) => (
                    <div key={j} className="flex justify-between text-xs text-gray-600">
                      <span>+ {a.name} ×{a.quantity || 1}</span>
                      <span>{sym}{(a.price * (a.quantity || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {item.ingredients && item.ingredients.length > 0 && (
                <div className="px-3 py-2 border-t border-gray-100 bg-amber-50/50 space-y-1">
                  <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Ingredients used</p>
                  {item.ingredients.map((ing, j) => (
                    <p key={j} className="text-xs text-gray-500">{ing.name} × {ing.quantity}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{sym}{receipt.subtotal.toFixed(2)}</span>
            </div>
            {receipt.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-purple-600">
                <span>Discount</span><span>−{sym}{receipt.discount_amount.toFixed(2)}</span>
              </div>
            )}
            {receipt.tax_amount > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax</span><span>{sym}{receipt.tax_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span>{sym}{receipt.total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-400 text-right">{receipt.payment_name}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Cash Movement Detail Modal ────────────────────────────────────────────────
function CashDetailModal({ movement, onClose }: {
  movement: CashMovementRow; onClose: () => void
}) {
  const isIn = movement.type === 'cash_in'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className={`flex items-center gap-3 px-5 py-4 border-b border-gray-100 ${isIn ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIn ? 'bg-emerald-100' : 'bg-red-100'}`}>
            {isIn
              ? <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
              : <ArrowUpCircle className="w-5 h-5 text-red-600" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{isIn ? 'Cash In' : 'Cash Out'}</h3>
            <p className="text-xs text-gray-500">
              {new Date(movement.created_at).toLocaleString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center gap-3">
              <span className="text-xs text-gray-500 flex-shrink-0">Amount</span>
              <AutoFitText
                text={`${isIn ? '+' : '−'}${fmt(movement.amount)}`}
                maxFontSize={20} minFontSize={13}
                className={`flex-1 min-w-0 text-right font-bold ${isIn ? 'text-emerald-700' : 'text-red-600'}`}
              />
            </div>
            <div className="flex justify-between items-center border-t border-gray-200 pt-3">
              <span className="text-xs text-gray-500">Note</span>
              <span className="text-sm text-gray-800 font-medium text-right max-w-[200px]">{movement.note || '—'}</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200 pt-3">
              <span className="text-xs text-gray-500">Cashier</span>
              <span className="text-sm text-gray-800 font-medium">{movement.cashier}</span>
            </div>
            <div className="flex justify-between items-start border-t border-gray-200 pt-3">
              <span className="text-xs text-gray-500">Shift</span>
              <span className="text-xs text-gray-600 text-right max-w-[200px]">{movement.shift_label}</span>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Wastage Modal ─────────────────────────────────────────────────────────────
function WastageModal({ items, receipts, total, onClose }: {
  items: { name: string; qty: number; total: number }[]
  receipts: {
    receipt_number: string
    date: string
    cogsAmount: number
    items: { name: string; qty: number; lineTotal: number }[]
  }[]
  total: number
  onClose: () => void
}) {
  const [tab, setTab] = useState<'receipts' | 'items'>('receipts')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(rn: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(rn) ? next.delete(rn) : next.add(rn)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-orange-50">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Wastage Summary</h3>
            <p className="text-xs text-gray-500">Voided receipts — stock stays consumed</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab('receipts')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'receipts'
                ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            By Receipt ({receipts.length})
          </button>
          <button
            onClick={() => setTab('items')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'items'
                ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            By Item ({items.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">

          {/* ── Receipts tab ── */}
          {tab === 'receipts' && (
            <>
              {receipts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No wastage recorded in this period</p>
              )}
              {receipts.map(r => {
                const isOpen = expanded.has(r.receipt_number)
                return (
                  <div key={r.receipt_number} className="border border-orange-100 rounded-xl overflow-hidden">
                    {/* Receipt header row — click to expand */}
                    <button
                      onClick={() => toggleExpand(r.receipt_number)}
                      className="w-full flex items-center gap-3 p-3 bg-orange-50/60 hover:bg-orange-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Flame className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-orange-700">{r.receipt_number}</span>
                          <span className="text-sm font-bold text-red-600 flex-shrink-0 ml-2">
                            {r.cogsAmount > 0 ? `−${fmt(r.cogsAmount)} cost` : `${r.items.length} item${r.items.length !== 1 ? 's' : ''}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-xs text-gray-400">{fmtDateTime(r.date)}</p>
                          <p className="text-[10px] text-orange-400 font-medium">
                            {r.items.length} item{r.items.length !== 1 ? 's' : ''} · tap to {isOpen ? 'collapse' : 'expand'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-orange-300 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {/* Expanded item list */}
                    {isOpen && (
                      <div className="bg-white divide-y divide-gray-50">
                        {r.items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                            <span className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              ×{item.qty}
                            </span>
                            <span className="text-sm text-gray-700">{item.name}</span>
                            <span className="ml-auto text-[10px] text-orange-400 font-medium">wasted</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ── Items tab ── */}
          {tab === 'items' && (
            <>
              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No wastage recorded in this period</p>
              )}
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-800 truncate pr-2">{item.name}</p>
                      <span className="text-sm font-bold text-orange-600 flex-shrink-0">{fmt(item.total)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{item.qty} unit{item.qty !== 1 ? 's' : ''} wasted</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <span className="text-sm font-semibold text-gray-700">Total Wastage Cost</span>
            <p className="text-[10px] text-gray-400 mt-0.5">Based on ingredient COGS</p>
          </div>
          <span className="text-base font-bold text-red-600">−{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Revert Void Confirm Modal ─────────────────────────────────────────────────
function RevertVoidModal({ receipt, onConfirm, onCancel, reverting }: {
  receipt: ReceiptRow
  onConfirm: () => void
  onCancel: () => void
  reverting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-indigo-50">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Revert Void</h3>
            <p className="text-xs text-gray-500">{receipt.receipt_number}</p>
          </div>
          <button onClick={onCancel} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div className="px-5 pt-5 pb-2 space-y-3">
          <div className="bg-indigo-50 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Receipt</span>
              <span className="text-sm font-semibold text-indigo-700">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between items-center border-t border-indigo-100 pt-2">
              <span className="text-xs text-gray-500">Amount</span>
              <span className="text-sm font-bold text-gray-900">{fmt(receipt.total)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-indigo-100 pt-2">
              <span className="text-xs text-gray-500">Cashier</span>
              <span className="text-sm text-gray-700">{receipt.cashier}</span>
            </div>
          </div>

          {/* Items preview */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 bg-gray-50 border-b border-gray-100">
              Items to restore ({receipt.items.length})
            </p>
            <div className="divide-y divide-gray-50 max-h-32 overflow-y-auto">
              {receipt.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-gray-700 truncate pr-2">{item.item_name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">×{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              This will restore the transaction to <span className="font-semibold">completed</span> status and re-add it to your sales figures. Stock adjustments from the original void may need to be reviewed manually.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onCancel} disabled={reverting}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={reverting}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
          >
            {reverting
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            {reverting ? 'Reverting…' : 'Revert to Active'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Void Confirm Modal ────────────────────────────────────────────────────────
function VoidModal({ receipt, onConfirm, onCancel, voiding }: {
  receipt: ReceiptRow
  onConfirm: (voidType: 'return_stock' | 'wastage') => void
  onCancel: () => void
  voiding: boolean
}) {
  const [selected, setSelected] = useState<'return_stock' | 'wastage' | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-red-50">
          <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Void Transaction</h3>
            <p className="text-xs text-gray-500">{receipt.receipt_number}</p>
          </div>
          <button onClick={onCancel} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount */}
        <div className="px-5 pt-4">
          <div className="bg-gray-50 rounded-xl p-3 flex justify-between">
            <span className="text-sm text-gray-500">Amount</span>
            <span className="text-sm font-bold text-gray-900">{fmt(receipt.total)}</span>
          </div>
        </div>

        {/* Void type selection */}
        <div className="px-5 py-4 space-y-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">How should stock be handled?</p>

          {/* Return to stock */}
          <button
            onClick={() => setSelected('return_stock')}
            disabled={voiding}
            className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
              selected === 'return_stock'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                selected === 'return_stock' ? 'bg-emerald-100' : 'bg-gray-100'
              }`}>
                <ArrowDownCircle className={`w-4 h-4 ${selected === 'return_stock' ? 'text-emerald-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${selected === 'return_stock' ? 'text-emerald-700' : 'text-gray-800'}`}>
                  Return to Stock
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Refund the sale and restore ingredients back to inventory. COGS entry removed.
                </p>
              </div>
            </div>
          </button>

          {/* Wastage */}
          <button
            onClick={() => setSelected('wastage')}
            disabled={voiding}
            className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
              selected === 'wastage'
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                selected === 'wastage' ? 'bg-orange-100' : 'bg-gray-100'
              }`}>
                <Trash2 className={`w-4 h-4 ${selected === 'wastage' ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${selected === 'wastage' ? 'text-orange-700' : 'text-gray-800'}`}>
                  Mark as Wastage
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Refund the sale but stock stays consumed. COGS entry kept — ingredients were already used.
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onCancel} disabled={voiding}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={voiding || !selected}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors ${
              selected === 'wastage'
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {voiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {voiding ? 'Voiding…' : selected === 'wastage' ? 'Void as Wastage' : selected === 'return_stock' ? 'Void & Return Stock' : 'Select an option'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const supabase = createClient()

  const [shopTimezone, setShopTimezone] = useState<string>('Asia/Manila')
  const [dateFrom, setDateFrom] = useState(() => startOfMonthTz('Asia/Manila'))
  const [dateTo, setDateTo] = useState(() => todayTz('Asia/Manila'))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currencySymbol, setCurrencySymbol] = useState('₱')
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [cashMovements, setCashMovements] = useState<CashMovementRow[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [chartData, setChartData] = useState<ChartPoint[]>([])

  // Inventory stock value (Raw Stocks category, cost × qty)
  const [stockValue, setStockValue] = useState<number | null>(null)
  const [stockValueItems, setStockValueItems] = useState<{ name: string; qty: number; cost: number; value: number }[]>([])

  // Table tab: 'sales' | 'cash'
  const [tableTab, setTableTab] = useState<'sales' | 'cash'>('sales')

  // Modal states
  const [modal, setModal] = useState<'payment' | 'cashout' | 'discount' | 'wastage' | 'stockvalue' | null>(null)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptRow | null>(null)
  const [cashDetail, setCashDetail] = useState<CashMovementRow | null>(null)
  const [voidTarget, setVoidTarget] = useState<ReceiptRow | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [revertVoidTarget, setRevertVoidTarget] = useState<ReceiptRow | null>(null)
  const [reverting, setReverting] = useState(false)

  // Fetch user role on mount — guard page access
  useEffect(() => {
    async function fetchRole() {
      setRoleLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: appUser } = await supabase
          .from('app_users')
          .select('role')
          .eq('auth_user_id', user.id)
          .single()
        const role = appUser?.role as UserRole
        const roleLower = role?.toLowerCase()
        if (!roleLower || (roleLower !== 'owner' && roleLower !== 'manager')) {
          // Cashiers and staff go back to POS
          router.push('/pos')
          return
        }
        setUserRole(role)
      } finally {
        setRoleLoading(false)
      }
    }
    fetchRole()
  }, [])

  // Quick presets — all dates resolved in shop timezone
  function applyPreset(preset: string) {
    const tz = shopTimezone
    const todayStr = todayTz(tz)
    if (preset === 'today') {
      setDateFrom(todayStr); setDateTo(todayStr)
    } else if (preset === 'this_month') {
      setDateFrom(startOfMonthTz(tz)); setDateTo(todayStr)
    } else if (preset === 'last_month') {
      // First day of previous month in shop tz
      const now = new Date()
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit',
      }).formatToParts(now)
      const y = parseInt(parts.find(p => p.type === 'year')!.value)
      const m = parseInt(parts.find(p => p.type === 'month')!.value)
      const prevMonth = m === 1 ? 12 : m - 1
      const prevYear  = m === 1 ? y - 1 : y
      const mm = String(prevMonth).padStart(2, '0')
      // Last day of previous month
      const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0))
      setDateFrom(`${prevYear}-${mm}-01`)
      setDateTo(toDateStrTz(lastDay, tz))
    } else if (preset === 'last_7') {
      const d = new Date(); d.setDate(d.getDate() - 7)
      setDateFrom(toDateStrTz(d, tz)); setDateTo(todayStr)
    } else if (preset === 'last_30') {
      const d = new Date(); d.setDate(d.getDate() - 30)
      setDateFrom(toDateStrTz(d, tz)); setDateTo(todayStr)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // ── Shop settings (currency + timezone) ──────────────────────────────
      const { data: shop } = await supabase.from('shops').select('id, currency_symbol, timezone').single()
      if (shop?.currency_symbol) setCurrencySymbol(shop.currency_symbol)
      const shopId = shop?.id
      const tz = shop?.timezone || 'Asia/Manila'
      setShopTimezone(tz)

      // ── Date window (inclusive, interpreted in shop timezone) ────────────────
      // Append the shop UTC offset so Supabase filters created_at correctly.
      // Without this, "today" in Manila (UTC+8) is treated as UTC midnight,
      // causing sales made in Manila time to appear under the wrong day.
      const tzOffset = (() => {
        // Get the UTC offset string for this timezone (e.g. "+08:00")
        const parts = new Intl.DateTimeFormat('en', {
          timeZone: tz, timeZoneName: 'shortOffset',
        }).formatToParts(new Date())
        const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0'
        return raw.replace('GMT', '') || '+00:00'
      })()
      const fromTs = `${dateFrom}T00:00:00${tzOffset}`
      const toTs   = `${dateTo}T23:59:59${tzOffset}`

      // ── Receipts + Cash movements fetched in parallel ─────────────────────
      const [{ data: rawReceipts, error: rErr }, { data: rawCashMovements }] = await Promise.all([
        supabase
          .from('receipts')
          .select(`
            id, receipt_number, subtotal, discount_amount, tax_amount,
            total, status, created_at, shift_id,
            payment_types ( name ),
            app_users ( name ),
            receipt_items (
              id, item_name, quantity, unit_price, line_total,
              modifiers, addons, note, variant_id, item_id
            )
          `)
          .in('status', ['completed', 'voided'])
          .gte('created_at', fromTs)
          .lte('created_at', toTs)
          .order('created_at', { ascending: false }),
        supabase
          .from('shift_cash_movements')
          .select('id, shift_id, type, amount, note, created_at')
          .in('type', ['cash_in', 'cash_out'])
          .gte('created_at', fromTs)
          .lte('created_at', toTs)
          .order('created_at', { ascending: false }),
      ])

      if (rErr) throw rErr

      // ── Shift labels ──────────────────────────────────────────────────────
      const shiftIds = [...new Set([
        ...(rawReceipts || []).map((r: any) => r.shift_id),
        ...(rawCashMovements || []).map((m: any) => m.shift_id),
      ].filter(Boolean))]
      let shiftMap: Record<string, { label: string; cashier: string }> = {}
      if (shiftIds.length > 0) {
        const { data: shifts } = await supabase
          .from('shifts')
          .select('id, clock_in, app_user_id, app_users(name)')
          .in('id', shiftIds)
        for (const s of shifts || []) {
          const d = new Date(s.clock_in)
          const timeStr = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
          const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
          const cashierName = (s as any).app_users?.name || 'Staff'
          shiftMap[s.id] = {
            label: `${cashierName} · ${dateStr} ${timeStr}`,
            cashier: cashierName,
          }
        }
      }

      // ── Item ingredients for receipt items ────────────────────────────────
      const allItemIds = [...new Set(
        (rawReceipts || []).flatMap((r: any) => r.receipt_items.map((ri: any) => ri.item_id).filter(Boolean))
      )]
      let ingredientMap: Record<string, { name: string; quantity: number }[]> = {}
      if (allItemIds.length > 0) {
        const { data: bom } = await supabase
          .from('item_ingredients')
          .select('item_id, quantity, items!item_ingredients_ingredient_id_fkey(name)')
          .in('item_id', allItemIds)
        for (const row of bom || []) {
          if (!ingredientMap[row.item_id]) ingredientMap[row.item_id] = []
          ingredientMap[row.item_id].push({ name: (row as any).items?.name || '', quantity: row.quantity })
        }
      }

      // ── Build cash movement rows ───────────────────────────────────────────
      const cashRows: CashMovementRow[] = (rawCashMovements || []).map((m: any) => ({
        id: m.id,
        type: m.type,
        amount: Number(m.amount),
        note: m.note || (m.type === 'cash_out' ? 'Cash out' : 'Cash in'),
        created_at: m.created_at,
        shift_label: shiftMap[m.shift_id]?.label || '—',
        cashier: shiftMap[m.shift_id]?.cashier || '—',
      }))
      setCashMovements(cashRows)

      // ── Build receipt rows ────────────────────────────────────────────────
      const rows: ReceiptRow[] = (rawReceipts || []).map((r: any) => ({
        id: r.id,
        receipt_number: r.receipt_number,
        transaction_number: null,
        cashier: r.app_users?.name || shiftMap[r.shift_id]?.cashier || '—',
        shift_label: r.shift_id ? (shiftMap[r.shift_id]?.label || 'Shift') : '—',
        shift_id: r.shift_id,
        created_at: r.created_at,
        subtotal: Number(r.subtotal),
        discount_amount: Number(r.discount_amount || 0),
        tax_amount: Number(r.tax_amount || 0),
        total: Number(r.total),
        // Normalise payment name: trim + lower-compare so 'cash'/'Cash'/'CASH' all
        // resolve consistently. Store with original capitalisation for display.
        payment_name: r.payment_types?.name?.trim() || '—',
        status: r.status,
        items: (r.receipt_items || []).map((ri: any) => ({
          id: ri.id,
          item_name: ri.item_name,
          quantity: ri.quantity,
          unit_price: Number(ri.unit_price),
          line_total: Number(ri.line_total),
          modifiers: ri.modifiers || [],
          addons: ri.addons || [],
          note: ri.note,
          variant_id: ri.variant_id,
          ingredients: ingredientMap[ri.item_id] || [],
        })),
      }))

      // ── Compute per-shift reference numbers (matches shift report page logic) ─
      const byShift: Record<string, ReceiptRow[]> = {}
      for (const row of rows) {
        const key = row.shift_id || '__no_shift__'
        if (!byShift[key]) byShift[key] = []
        byShift[key].push(row)
      }
      const refMap: Record<string, string> = {}
      for (const shiftRows of Object.values(byShift)) {
        const sorted = [...shiftRows].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        sorted.forEach((r, idx) => {
          refMap[r.id] = buildRefNumber(new Date(r.created_at), idx + 1)
        })
      }
      const rowsWithRefs = rows.map(r => ({ ...r, transaction_number: refMap[r.id] || null }))

      setReceipts(rowsWithRefs)

      // ── Payment breakdown — completed only ────────────────────────────────
      // Group by normalised (lowercase-trimmed) key so 'Cash'/'cash'/'CASH'
      // all land in the same bucket. Preserves original casing for display.
      const completedRows = rows.filter(r => r.status === 'completed')
      const payMap: Record<string, { amount: number; count: number; displayName: string }> = {}
      for (const r of completedRows) {
        const rawName = r.payment_name
        const key = rawName?.toLowerCase().trim() || '—'
        if (!payMap[key]) payMap[key] = { amount: 0, count: 0, displayName: rawName }
        payMap[key].amount += r.total
        payMap[key].count += 1
      }
      const paymentBreakdown = Object.entries(payMap).map(([, v]) => ({
        name: v.displayName, amount: v.amount, count: v.count,
      })).sort((a, b) => b.amount - a.amount)

      // ── Totals — completed only (voided rows stay visible but don't count) ─
      const grossSales = completedRows.reduce((s, r) => s + r.subtotal, 0)
      const discounts = completedRows.reduce((s, r) => s + r.discount_amount, 0)
      const taxes = completedRows.reduce((s, r) => s + r.tax_amount, 0)
      const cashoutTotal = (rawCashMovements || [])
        .filter((m: any) => m.type === 'cash_out')
        .reduce((s: number, m: any) => s + Number(m.amount), 0)

      // COGS from financial_entries — completed sales only (reference_type = 'receipt')
      // Wastage voids use reference_type = 'receipt_void' and go to the Wastage card instead
      let cogsQuery = supabase
        .from('financial_entries')
        .select('amount')
        .eq('type', 'cogs')
        .eq('reference_type', 'receipt')   // ← excludes wastage void entries
        .gte('entry_date', dateFrom)
        .lte('entry_date', dateTo)
      if (shopId) cogsQuery = cogsQuery.eq('shop_id', shopId)
      const { data: cogsEntries, error: cogsErr } = await cogsQuery
      const cogs = (cogsEntries || []).reduce((s, e) => s + Number(e.amount), 0)

      // netSales is recalculated after wastageTotal is known (see below)
      const netAfterCogs = grossSales - cashoutTotal - discounts - taxes

      // ── Wastage ───────────────────────────────────────────────────────────
      // Source of truth: stock_movements rows written by the void route when
      // void_type='wastage'. Notes start with 'POS Wastage:' (BOM items) or
      // 'Wastage:' (non-BOM items). quantity=0 on all of them.
      const { data: wastageMovements } = await supabase
        .from('stock_movements')
        .select('id, item_id, note, created_at, reference_id')
        .eq('shop_id', shopId)
        .eq('type', 'loss')
        .eq('reference_type', 'receipt')
        .or('note.ilike.POS Wastage:%,note.ilike.Wastage:%')
        .gte('created_at', fromTs)
        .lte('created_at', toTs)

      const wastagemovs = wastageMovements || []

      // Parse item name + qty from the note.
      // BOM path:     "POS Wastage: {item_name} x{qty} — {ingQty} units..."
      // Non-BOM path: "Wastage: {item_name} x{qty} — dispensed at sale..."
      function parseWastageNote(note: string): { itemName: string; qty: number } {
        const body = note.replace(/^(POS Wastage|Wastage):\s*/i, '')
        const match = body.match(/^(.+?)\s+x(\d+(?:\.\d+)?)\s*[—\-]/)
        if (match) return { itemName: match[1].trim(), qty: Number(match[2]) }
        return { itemName: body.split(' x')[0].trim(), qty: 1 }
      }

      // Group movements by receipt_id, deduplicate by itemName within each receipt
      // (BOM items produce one stock_movement row per ingredient, but the item name
      // in the note is the same sold item — we only want to show it once per receipt)
      const wastageByReceipt: Record<string, {
        date: string
        items: Record<string, number>  // itemName → qty
      }> = {}
      for (const m of wastagemovs) {
        const rid = m.reference_id
        if (!rid) continue
        if (!wastageByReceipt[rid]) wastageByReceipt[rid] = { date: m.created_at, items: {} }
        const { itemName, qty } = parseWastageNote(m.note)
        // Only set qty once per item name per receipt (first occurrence wins)
        if (!wastageByReceipt[rid].items[itemName]) {
          wastageByReceipt[rid].items[itemName] = qty
        }
      }

      // Fetch receipt numbers for all wastage receipt IDs
      const wastageReceiptIds = Object.keys(wastageByReceipt)
      const receiptNumberMap: Record<string, string> = {}
      if (wastageReceiptIds.length > 0) {
        const { data: rNums } = await supabase
          .from('receipts')
          .select('id, receipt_number')
          .in('id', wastageReceiptIds)
        for (const r of (rNums || [])) receiptNumberMap[r.id] = r.receipt_number
      }

      // COGS cost from financial_entries — used for the total ₱ amount on the card
      let wastageCogsQuery = supabase
        .from('financial_entries')
        .select('amount, reference_id')
        .eq('type', 'cogs')
        .eq('reference_type', 'receipt_void')
        .gte('entry_date', dateFrom)
        .lte('entry_date', dateTo)
      if (shopId) wastageCogsQuery = wastageCogsQuery.eq('shop_id', shopId)
      const { data: wastageCogsEntries } = await wastageCogsQuery

      const cogsPerReceipt: Record<string, number> = {}
      for (const e of (wastageCogsEntries || [])) {
        if (e.reference_id) {
          cogsPerReceipt[e.reference_id] = (cogsPerReceipt[e.reference_id] || 0) + Number(e.amount)
        }
      }
      const wastageTotal = Object.values(cogsPerReceipt).reduce((s, v) => s + v, 0)

      // Net Sales = Gross − COGS − Wastage − Expenses − Discounts − Taxes
      const netSales = grossSales - cogs - wastageTotal - cashoutTotal - discounts - taxes

      // Build per-item summary (aggregated across all wastage receipts)
      const wastageAgg: Record<string, number> = {}
      for (const { items: wItems } of Object.values(wastageByReceipt)) {
        for (const [name, qty] of Object.entries(wItems)) {
          wastageAgg[name] = (wastageAgg[name] || 0) + qty
        }
      }
      const wastageItems = Object.entries(wastageAgg)
        .map(([name, qty]) => ({ name, qty, total: 0 }))
        .sort((a, b) => b.qty - a.qty)

      // Build per-receipt breakdown for the modal
      const wastageReceipts = wastageReceiptIds
        .sort((a, b) => new Date(wastageByReceipt[b].date).getTime() - new Date(wastageByReceipt[a].date).getTime())
        .map(rid => ({
          receipt_number: receiptNumberMap[rid] || rid.slice(0, 8),
          date: wastageByReceipt[rid].date,
          cogsAmount: cogsPerReceipt[rid] || 0,
          items: Object.entries(wastageByReceipt[rid].items).map(([name, qty]) => ({
            name,
            qty,
            lineTotal: 0,
          })),
        }))

      // ── Cashout breakdown ─────────────────────────────────────────────────
      const cashoutBreakdown = (rawCashMovements || [])
        .filter((m: any) => m.type === 'cash_out')
        .map((m: any) => ({
          note: m.note || 'Cash out',
          amount: Number(m.amount),
          date: m.created_at,
          shift: shiftMap[m.shift_id]?.label || 'Shift',
        }))

      // ── Discount breakdown ─────────────────────────────────────────────────
      const discountBreakdown = completedRows
        .filter(r => r.discount_amount > 0)
        .map(r => ({ receipt_number: r.receipt_number, amount: r.discount_amount, date: r.created_at }))

      // ── Raw Stocks inventory value (cost × qty, category name = 'Raw Stocks') ─
      const { data: rawStockItems } = await supabase
        .from('items')
        .select('name, cost, inventory_levels(quantity), categories!items_category_id_fkey(name)')
        .not('cost', 'is', null)
      const rawStockRows = (rawStockItems || []).filter(
        (i: any) => i.categories?.name === 'Raw Stocks' && (i.inventory_levels?.[0]?.quantity ?? 0) > 0
      )
      const stockValueRows = rawStockRows.map((i: any) => ({
        name:  i.name,
        qty:   Number(i.inventory_levels?.[0]?.quantity ?? 0),
        cost:  Number(i.cost),
        value: Number(i.inventory_levels?.[0]?.quantity ?? 0) * Number(i.cost),
      })).sort((a: any, b: any) => b.value - a.value)
      const totalStockValue = stockValueRows.reduce((s: number, i: any) => s + i.value, 0)
      setStockValue(totalStockValue)
      setStockValueItems(stockValueRows)

      setSummary({
        grossSales, cogs, cashouts: cashoutTotal, discounts, taxes,
        netSales, netAfterCogs, wastageTotal, wastageItems, wastageReceipts,
        paymentBreakdown, cashoutBreakdown, discountBreakdown,
      })

      // ── Top selling items — completed only ───────────────────────────────
      const itemAgg: Record<string, TopItem> = {}
      for (const r of completedRows) {
        for (const item of r.items) {
          const k = item.item_name
          if (!itemAgg[k]) itemAgg[k] = { name: k, qty: 0, revenue: 0 }
          itemAgg[k].qty += item.quantity
          itemAgg[k].revenue += item.line_total
        }
      }
      setTopItems(Object.values(itemAgg).sort((a, b) => b.qty - a.qty).slice(0, 10))

      // ── Sales timeline chart ───────────────────────────────────────────────
      // Group by day if range > 1 day, else by hour
      const diffDays = Math.ceil(
        (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
      const buckets: Record<string, { sales: number; txCount: number }> = {}
      for (const r of [...completedRows].reverse()) {
        const d = new Date(r.created_at)
        let key: string
        if (diffDays <= 1) {
          key = `${d.getHours().toString().padStart(2, '0')}:00`
        } else if (diffDays <= 60) {
          key = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        } else {
          key = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
        }
        if (!buckets[key]) buckets[key] = { sales: 0, txCount: 0 }
        buckets[key].sales += r.total
        buckets[key].txCount += 1
      }
      const chartPts: ChartPoint[] = Object.entries(buckets).map(([label, v]) => ({
        label, sales: v.sales, txCount: v.txCount,
      }))
      setChartData(chartPts)

    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  async function handleVoid(voidType: 'return_stock' | 'wastage') {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const res = await fetch(`/api/transactions/${voidTarget.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void_note: `Voided from dashboard`, void_type: voidType }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to void transaction')
      }
      setVoidTarget(null)
      load()
    } catch (e: any) {
      setError(e.message || 'Failed to void transaction')
    } finally {
      setVoiding(false)
    }
  }

  async function handleRevertVoid() {
    if (!revertVoidTarget) return
    setReverting(true)
    try {
      const res = await fetch(`/api/transactions/${revertVoidTarget.id}/revert-void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Void reverted from dashboard' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to revert void')
      }
      setRevertVoidTarget(null)
      load()
    } catch (e: any) {
      setError(e.message || 'Failed to revert void')
    } finally {
      setReverting(false)
    }
  }

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'last_7', label: '7 days' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'last_30', label: '30 days' },
  ]

  const maxQty = topItems[0]?.qty || 1
  const showCogs = canSeeCogs(userRole)

  // Cash movement totals for the table header
  const cashInTotal = cashMovements.filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0)
  const cashOutTotal = cashMovements.filter(m => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0)

  // ── Cash-on-hand: only cash-method sales minus cashouts ───────────────────
  // Cashouts always come out of the physical cash drawer, never out of GCash/Card
  // balances, so this is computed from cash-method sales only — not the blended
  // netAfterCogs figure, which nets cashouts against ALL payment methods combined.
  // Use case-insensitive match so 'cash', 'Cash', 'CASH' all resolve correctly.
  const cashSalesAmount = summary?.paymentBreakdown.find(
    b => b.name?.toLowerCase() === 'cash'
  )?.amount ?? 0
  const cashOnHand = cashSalesAmount - (summary?.cashouts ?? 0)

  // Don't render anything until role is confirmed — prevents flash of locked state
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Checking access…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time P&L from POS transactions</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 self-start sm:self-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Date controls ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setDatePickerOpen(true)}
            className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors w-full sm:w-auto"
          >
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="truncate">
              {dateFrom === dateTo ? fmtDateDisplay(dateFrom) : `${fmtDateDisplay(dateFrom)} – ${fmtDateDisplay(dateTo)}`}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto sm:ml-0" />
          </button>
        </div>
      </div>

      {datePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setDatePickerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Select date range</h3>
              <button onClick={() => setDatePickerOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <button onClick={() => setDatePickerOpen(false)}
              className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* ── P&L Summary Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Gross Sales" icon={TrendingUp} color="text-emerald-700" bg="bg-emerald-50"
          value={fmt(summary?.grossSales ?? 0)}
          sub={`${receipts.length} transaction${receipts.length !== 1 ? 's' : ''}`}
          clickable onClick={() => setModal('payment')}
        />
        <StatCard
          label="Cost of Goods Sold" icon={Package} color="text-blue-600" bg="bg-blue-50"
          value={fmt(summary?.cogs ?? 0)}
          sub="Auto-calculated from BOM"
          locked={!showCogs}
        />
        <StatCard
          label="Expenses" icon={ArrowUpCircle} color="text-orange-600" bg="bg-orange-50"
          value={fmt(summary?.cashouts ?? 0)}
          sub="Cash outs from shifts"
          clickable onClick={() => setModal('cashout')}
        />
        <StatCard
          label="Taxes & Discounts" icon={Percent} color="text-purple-600" bg="bg-purple-50"
          value={fmt((summary?.taxes ?? 0) + (summary?.discounts ?? 0))}
          sub={`${fmt(summary?.taxes ?? 0)} tax · ${fmt(summary?.discounts ?? 0)} disc.`}
          clickable onClick={() => setModal('discount')}
        />
        <StatCard
          label="Wastage" icon={Flame} color="text-red-500" bg="bg-red-50"
          value={fmt(summary?.wastageTotal ?? 0)}
          sub="Voided without returning stock"
          clickable onClick={() => setModal('wastage')}
        />
        {/* Net after COGS (excludes cashout expenses) */}
        <div className={`rounded-2xl border-2 p-5 overflow-hidden ${
          (summary?.netAfterCogs ?? 0) >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-300 bg-red-50'
        }`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              (summary?.netAfterCogs ?? 0) >= 0 ? 'bg-blue-100' : 'bg-red-100'
            }`}>
              {(summary?.netAfterCogs ?? 0) >= 0
                ? <TrendingUp className="w-5 h-5 text-blue-700" />
                : <TrendingDown className="w-5 h-5 text-red-600" />}
            </div>
          </div>
          <AutoFitText
            text={fmt(summary?.netAfterCogs ?? 0)}
            maxFontSize={24} minFontSize={13}
            className={`font-bold tracking-tight ${
              (summary?.netAfterCogs ?? 0) >= 0 ? 'text-blue-700' : 'text-red-600'
            }`}
          />
          <p className="text-xs font-medium text-gray-500 mt-1">Net after cashout discount/taxes</p>
          <p className="text-xs text-gray-400 mt-0.5">Gross − expenses − disc/taxes (all payment methods)</p>

          {/* Cash-on-hand breakdown — cash-method sales only, since cashouts come from the drawer */}
          <div className="mt-3 pt-3 border-t border-blue-100 space-y-1 min-w-0">
            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">Cash on hand</p>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">Cash sales</span>
              <AutoFitText
                text={fmt(cashSalesAmount)}
                maxFontSize={12} minFontSize={9}
                className="flex-1 min-w-0 text-right font-medium text-gray-700"
              />
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">− Cash outs</span>
              <AutoFitText
                text={`−${fmt(summary?.cashouts ?? 0)}`}
                maxFontSize={12} minFontSize={9}
                className="flex-1 min-w-0 text-right font-medium text-red-600"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2 pt-1 border-t border-blue-100">
              <AutoFitText
                text="Remaining cash"
                maxFontSize={12} minFontSize={9}
                className="font-bold text-gray-700 flex-shrink-0"
              />
              <AutoFitText
                text={fmt(cashOnHand)}
                maxFontSize={14} minFontSize={9}
                className={`sm:flex-1 sm:min-w-0 sm:text-right font-bold ${cashOnHand >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
              />
            </div>
          </div>
        </div>
        {/* Net Sales */}
        <div className={`rounded-2xl border-2 p-5 overflow-hidden ${
          (summary?.netSales ?? 0) >= 0 ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
        }`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              (summary?.netSales ?? 0) >= 0 ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              {(summary?.netSales ?? 0) >= 0
                ? <TrendingUp className="w-5 h-5 text-emerald-700" />
                : <TrendingDown className="w-5 h-5 text-red-600" />}
            </div>
          </div>
          <AutoFitText
            text={fmt(summary?.netSales ?? 0)}
            maxFontSize={24} minFontSize={13}
            className={`font-bold tracking-tight ${
              (summary?.netSales ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          />
          <p className="text-xs font-medium text-gray-500 mt-1">Net Sales</p>
          <p className="text-xs text-gray-400 mt-0.5">After COGS, wastages, expenses & discounts</p>
        </div>
        {/* Stock Value at Cost — Raw Stocks category */}
        <button
          onClick={() => setModal('stockvalue')}
          className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-5 overflow-hidden text-left hover:shadow-md hover:border-teal-300 active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <Warehouse className="w-5 h-5 text-teal-600" />
            </div>
            <ChevronRight className="w-4 h-4 text-teal-300 mt-1" />
          </div>
          <AutoFitText
            text={stockValue !== null ? fmt(stockValue) : '—'}
            maxFontSize={24} minFontSize={13}
            className="font-bold text-teal-700 tracking-tight"
          />
          <p className="text-xs font-medium text-gray-500 mt-1">Unsold Stock Value based on Cost</p>
          <p className="text-xs text-gray-400 mt-0.5">Raw Stocks on hand · cost basis</p>
        </button>
      </div>

      {/* ── Sales Activity Graph ── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-800">Sales Activity</h2>
              <span className="text-xs text-gray-400 ml-1">timeline for selected period</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" />
                {fmt(summary?.grossSales ?? 0)} total
              </span>
              <span className="text-gray-300">·</span>
              <span>{receipts.length} transactions</span>
            </div>
          </div>
          <div className="px-5 py-4">
            <SalesChart data={chartData} currencySymbol={currencySymbol} />
          </div>
        </div>
      )}

      {/* ── Two-column: Top Items chart + summary stats ── */}
      {topItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top Selling Items */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-800">Top Selling Items</h2>
              <span className="text-xs text-gray-400 ml-1">by quantity sold</span>
            </div>
            <div className="p-4 space-y-2.5">
              {topItems.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${
                    i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate pr-2">{item.name}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-gray-400">{item.qty} sold</span>
                        <span className="text-sm font-semibold text-indigo-600">{fmt(item.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-indigo-400' : i === 2 ? 'bg-emerald-400' : 'bg-gray-300'
                      }`}
                        style={{ width: `${(item.qty / maxQty) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sales by Payment Method mini summary */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-gray-800">Sales by Payment Method</h2>
            </div>
            <div className="p-4 space-y-3">
              {(summary?.paymentBreakdown ?? []).map(b => {
                const pct = (summary?.grossSales ?? 0) > 0 ? (b.amount / (summary?.grossSales ?? 1)) * 100 : 0
                const icons: Record<string, any> = { Cash: Banknote, GCash: Smartphone, Card: CreditCard }
                const IconComp = icons[b.name] || CreditCard
                const colors: Record<string, string> = {
                  Cash: 'bg-emerald-500', GCash: 'bg-blue-500', Card: 'bg-purple-500',
                }
                const barColor = colors[b.name] || 'bg-gray-400'
                return (
                  <div key={b.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                          <IconComp className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{b.name}</span>
                        <span className="text-xs text-gray-400">{b.count} tx</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900">{fmt(b.amount)}</span>
                        <span className="text-xs text-gray-400 ml-2">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {(summary?.paymentBreakdown ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No sales data</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Transactions + Cash Movements Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

        {/* Tab Header */}
        <div className="px-5 py-0 border-b border-gray-100 flex items-center justify-between">
          <div className="flex">
            <button
              onClick={() => setTableTab('sales')}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                tableTab === 'sales'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Receipt className="w-4 h-4" />
              Sales Transactions
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                tableTab === 'sales' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
              }`}>{receipts.length}</span>
            </button>
            <button
              onClick={() => setTableTab('cash')}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                tableTab === 'cash'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Banknote className="w-4 h-4" />
              Cash In / Out Logs
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                tableTab === 'cash' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
              }`}>{cashMovements.length}</span>
            </button>
          </div>
          {tableTab === 'cash' && cashMovements.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <ArrowDownCircle className="w-3.5 h-3.5" /> {fmt(cashInTotal)}
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <ArrowUpCircle className="w-3.5 h-3.5" /> {fmt(cashOutTotal)}
              </span>
            </div>
          )}
        </div>

        {/* ── Sales Transactions Table ── */}
        {tableTab === 'sales' && (
          <>
            {receipts.length === 0 && !loading ? (
              <div className="p-12 text-center">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No transactions in this period</p>
                <p className="text-sm text-gray-400 mt-1">Adjust the date range or check the POS</p>
              </div>
            ) : (
              <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto' }}>
                <table className="w-full text-sm min-w-[1050px]">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {['Receipt #', 'Ref #', 'Time', 'Cashier', 'Shift', 'Items', 'Payment', 'Amount', 'Actions'].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap ${i === 0 ? 'sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {receipts.map(r => (
                      <tr key={r.id} onClick={() => setReceiptDetail(r)} className={`hover:bg-gray-50/80 transition-colors group cursor-pointer ${r.status === 'voided' ? 'opacity-60 bg-red-50/40' : ''}`}>
                        <td className={`px-4 py-3 sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${r.status === 'voided' ? 'bg-red-50' : 'bg-white'} group-hover:bg-gray-50/80`}>
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-sm font-semibold ${r.status === 'voided' ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>{r.receipt_number}</span>
                            {r.status === 'voided' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600 w-fit">VOIDED</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.transaction_number
                            ? <span className="text-xs font-mono font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{r.transaction_number}</span>
                            : <span className="text-xs text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString('en-PH', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-indigo-600">
                                {r.cashier.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs text-gray-700 font-medium truncate max-w-[80px]">{r.cashier}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500 max-w-[120px] block truncate">{r.shift_label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setReceiptDetail(r)}
                            className="text-left group/items hover:bg-indigo-50 rounded-lg p-1 -m-1 transition-colors">
                            <div className="space-y-0.5">
                              {r.items.slice(0, 2).map((item, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className="text-xs text-gray-700 truncate max-w-[140px]">{item.item_name}</span>
                                  <span className="text-[10px] text-gray-400">×{item.quantity}</span>
                                </div>
                              ))}
                              {r.items.length > 2 && (
                                <span className="text-[10px] text-indigo-500 font-medium">
                                  +{r.items.length - 2} more items
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/items:opacity-100 transition-opacity">
                              <Eye className="w-3 h-3 text-indigo-400" />
                              <span className="text-[10px] text-indigo-500">View receipt</span>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                            {r.payment_name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{fmt(r.total)}</p>
                            {r.discount_amount > 0 && (
                              <p className="text-[10px] text-purple-600">−{fmt(r.discount_amount)} disc.</p>
                            )}
                            {r.tax_amount > 0 && (
                              <p className="text-[10px] text-gray-400">{fmt(r.tax_amount)} tax</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setReceiptDetail(r)} title="View receipt"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button title="Reprint" onClick={() => window.print()}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {r.status !== 'voided' && (
                              <button onClick={() => setVoidTarget(r)} title="Void"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {r.status === 'voided' && (
                              <button onClick={() => setRevertVoidTarget(r)} title="Revert Void"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Cash In / Out Logs Table ── */}
        {tableTab === 'cash' && (
          <>
            {cashMovements.length === 0 && !loading ? (
              <div className="p-12 text-center">
                <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No cash movements in this period</p>
                <p className="text-sm text-gray-400 mt-1">Cash ins and outs will appear here</p>
              </div>
            ) : (
              <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto' }}>
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {['Type', 'Time', 'Cashier', 'Shift', 'Note', 'Amount'].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap ${i === 0 ? 'sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cashMovements.map(m => (
                      <tr key={m.id} onClick={() => setCashDetail(m)} className="hover:bg-gray-50/80 transition-colors cursor-pointer">
                        <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                          {m.type === 'cash_in' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                              <ArrowDownCircle className="w-3 h-3" /> Cash In
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                              <ArrowUpCircle className="w-3 h-3" /> Cash Out
                            </span>
                          )}
                        </td>
                        {/* Time */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString('en-PH', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        {/* Cashier */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-gray-500">
                                {m.cashier.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs text-gray-700 font-medium truncate max-w-[80px]">{m.cashier}</span>
                          </div>
                        </td>
                        {/* Shift */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500 max-w-[160px] block truncate">{m.shift_label}</span>
                        </td>
                        {/* Note */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-600">{m.note}</span>
                        </td>
                        {/* Amount */}
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${
                            m.type === 'cash_in' ? 'text-emerald-700' : 'text-red-600'
                          }`}>
                            {m.type === 'cash_in' ? '+' : '−'}{fmt(m.amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-500">
                        Net cash movement
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-bold ${
                          cashInTotal - cashOutTotal >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          {cashInTotal - cashOutTotal >= 0 ? '+' : '−'}{fmt(Math.abs(cashInTotal - cashOutTotal))}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'payment' && summary && (
        <PaymentModal breakdown={summary.paymentBreakdown} total={summary.grossSales} onClose={() => setModal(null)} />
      )}
      {modal === 'cashout' && summary && (
        <CashoutModal breakdown={summary.cashoutBreakdown} total={summary.cashouts} onClose={() => setModal(null)} />
      )}
      {modal === 'discount' && summary && (
        <DiscountModal breakdown={summary.discountBreakdown} total={summary.discounts} taxes={summary.taxes} onClose={() => setModal(null)} />
      )}
      {modal === 'wastage' && summary && (
        <WastageModal
          items={summary.wastageItems}
          receipts={summary.wastageReceipts}
          total={summary.wastageTotal}
          onClose={() => setModal(null)}
        />
      )}
      {receiptDetail && (
        <ReceiptModal receipt={receiptDetail} onClose={() => setReceiptDetail(null)} currencySymbol={currencySymbol} />
      )}
      {cashDetail && (
        <CashDetailModal movement={cashDetail} onClose={() => setCashDetail(null)} />
      )}
      {voidTarget && (
        <VoidModal receipt={voidTarget} onConfirm={(voidType) => handleVoid(voidType)} onCancel={() => setVoidTarget(null)} voiding={voiding} />
      )}
      {revertVoidTarget && (
        <RevertVoidModal
          receipt={revertVoidTarget}
          onConfirm={handleRevertVoid}
          onCancel={() => setRevertVoidTarget(null)}
          reverting={reverting}
        />
      )}
      {modal === 'stockvalue' && (
        <StockValueModal items={stockValueItems} total={stockValue ?? 0} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
