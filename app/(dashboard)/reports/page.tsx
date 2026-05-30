'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useShop } from '@/lib/hooks/useShop'
import { DateRangeFilter } from '@/components/reports/DateRangeFilter'
import {
  TrendingUp, DollarSign, ArrowDownCircle, ArrowUpCircle,
  Receipt, Ban, ShoppingBag, BarChart2, RefreshCw,
  Clock, LogIn, LogOut, User, Calendar, Package,
  ChevronDown, CheckCircle2, Banknote, Smartphone,
  CreditCard, Search, X,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type DateRange = {
  from: string
  to: string
  label: string
}

type UnifiedTx = {
  id: string
  _type: 'sale' | 'refund' | 'cash_in' | 'cash_out'
  _time: Date
  _ref: string
  _staff: string
  total?: number
  amount?: number
  note?: string
  void_note?: string
  payment_types?: { name: string }
  shift_id?: string
  _items?: { quantity: number; item_name: string; line_total: number }[]
}

type ShiftCard = {
  id: string
  cashier: string
  cashier_role: string
  clock_in: string
  clock_out: string | null
  status: 'open' | 'closed'
  opening_cash: number
  closing_cash: number | null
  note: string | null
  total_sales?: number
  total_transactions?: number
  cash_out?: number
}

type ShiftDetail = {
  cashMovements: { id: string; type: string; amount: number; note: string; created_at: string }[]
  receipts: {
    id: string; receipt_number: string; total: number; subtotal: number
    discount_amount: number; tax_amount: number; status: string
    payment_name: string; created_at: string
    items: { item_name: string; quantity: number; unit_price: number; line_total: number }[]
  }[]
  productSummary: { name: string; qty: number; revenue: number }[]
  paymentBreakdown: { name: string; amount: number; count: number }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────
const PRESETS: DateRange[] = [
  {
    label: 'Today',
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 7 days',
    from: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 30 days',
    from: new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'This month',
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildRefNumber(date: Date, sequence: number): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const y = String(date.getFullYear())
  return `${m}${d}${y}-${String(sequence).padStart(5, '0')}`
}

const fmt = (n: number, sym = '₱') =>
  `${sym}${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function duration(clockIn: string, clockOut: string | null): string {
  const start = new Date(clockIn).getTime()
  const end = clockOut ? new Date(clockOut).getTime() : Date.now()
  const mins = Math.floor((end - start) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, bg, text, isLoading, prefix = '',
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; bg: string; text: string
  isLoading: boolean; prefix?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {isLoading
          ? <div className="h-6 w-20 bg-gray-100 rounded animate-pulse mt-1" />
          : <p className={`text-lg font-bold ${text} leading-tight`}>{prefix}{value}</p>
        }
        {sub && !isLoading && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: UnifiedTx['_type'] }) {
  if (type === 'sale')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium whitespace-nowrap">
        <Receipt className="w-2.5 h-2.5" /> Sale
      </span>
    )
  if (type === 'refund')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-medium whitespace-nowrap">
        <Ban className="w-2.5 h-2.5" /> Refund
      </span>
    )
  if (type === 'cash_in')
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium whitespace-nowrap">
        <ArrowDownCircle className="w-2.5 h-2.5" /> Cash In
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium whitespace-nowrap">
      <ArrowUpCircle className="w-2.5 h-2.5" /> Cash Out
    </span>
  )
}

function PayIcon({ name }: { name: string }) {
  const n = name?.toLowerCase() || ''
  if (n.includes('cash')) return <Banknote className="w-3.5 h-3.5" />
  if (n.includes('gcash') || n.includes('g-cash')) return <Smartphone className="w-3.5 h-3.5" />
  return <CreditCard className="w-3.5 h-3.5" />
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function ShiftDetailPanel({
  shift, detail, loadingDetail, currencySymbol,
}: {
  shift: ShiftCard; detail: ShiftDetail | null; loadingDetail: boolean; currencySymbol: string
}) {
  const sym = currencySymbol || '₱'

  if (loadingDetail) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading shift details…
      </div>
    )
  }
  if (!detail) return null

  const salesTotal = detail.receipts.filter(r => r.status !== 'voided').reduce((s, r) => s + r.total, 0)
  const cashIn = detail.cashMovements.filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0)
  const cashOut = detail.cashMovements.filter(m => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0)
  const cashSales = detail.receipts
    .filter(r => r.status !== 'voided' && r.payment_name?.toLowerCase() === 'cash')
    .reduce((s, r) => s + r.total, 0)
  const expectedCash = shift.opening_cash + cashIn - cashOut + cashSales
  const maxQty = detail.productSummary[0]?.qty || 1
  const barColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-blue-500']

  return (
    <div className="border-t border-indigo-100 bg-indigo-50/30">
      {/* Timeline */}
      <div className="px-5 py-4 border-b border-indigo-100/60">
        <div className="flex items-center text-xs">
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <LogIn className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-emerald-700 font-semibold">Open</span>
            <span className="text-gray-500">{fmtTime(shift.clock_in)}</span>
            <span className="text-gray-400">{fmtDate(shift.clock_in)}</span>
          </div>
          <div className="flex-1 h-px bg-gray-300 mx-2 mt-[-24px] relative">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center">
              <Clock className="w-3 h-3 text-gray-400 mb-0.5" />
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{duration(shift.clock_in, shift.clock_out)}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${shift.status === 'open' ? 'bg-amber-100' : 'bg-gray-100'}`}>
              {shift.status === 'open' ? <Clock className="w-4 h-4 text-amber-500" /> : <LogOut className="w-4 h-4 text-gray-500" />}
            </div>
            <span className={`font-semibold ${shift.status === 'open' ? 'text-amber-600' : 'text-gray-600'}`}>
              {shift.status === 'open' ? 'Active' : 'Closed'}
            </span>
            <span className="text-gray-500">{shift.clock_out ? fmtTime(shift.clock_out) : '—'}</span>
            <span className="text-gray-400">{shift.clock_out ? fmtDate(shift.clock_out) : 'Still open'}</span>
          </div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT */}
        <div className="space-y-4">
          {/* Cash position */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Cash Position</h4>
            </div>
            <div className="px-4 py-3 space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Opening cash</span><span className="font-semibold text-gray-800">{fmt(shift.opening_cash, sym)}</span></div>
              {cashIn > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-blue-600"><ArrowDownCircle className="w-3.5 h-3.5" />Cash in</span><span className="font-semibold text-blue-700">+{fmt(cashIn, sym)}</span></div>}
              {cashOut > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-orange-600"><ArrowUpCircle className="w-3.5 h-3.5" />Cash out</span><span className="font-semibold text-red-600">−{fmt(cashOut, sym)}</span></div>}
              <div className="flex justify-between"><span className="flex items-center gap-1.5 text-gray-500"><Banknote className="w-3.5 h-3.5" />Cash sales</span><span className="font-semibold text-gray-800">+{fmt(cashSales, sym)}</span></div>
              <div className="border-t border-gray-100 pt-2.5 flex justify-between"><span className="font-semibold text-gray-700">Expected in drawer</span><span className="text-base font-bold text-emerald-700">{fmt(expectedCash, sym)}</span></div>
              {shift.closing_cash !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Actual closing cash</span>
                  <span className={`font-semibold ${Math.abs(shift.closing_cash - expectedCash) < 0.01 ? 'text-emerald-700' : shift.closing_cash > expectedCash ? 'text-blue-600' : 'text-red-600'}`}>{fmt(shift.closing_cash, sym)}</span>
                </div>
              )}
              {shift.closing_cash !== null && Math.abs(shift.closing_cash - expectedCash) >= 0.01 && (
                <div className="flex justify-between bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-amber-700 text-xs font-medium">Variance</span>
                  <span className={`text-xs font-bold ${shift.closing_cash - expectedCash >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {shift.closing_cash - expectedCash >= 0 ? '+' : ''}{fmt(shift.closing_cash - expectedCash, sym)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sales summary */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Sales Summary</h4>
            </div>
            <div className="px-4 py-3 space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total sales</span><span className="font-bold text-indigo-700">{fmt(salesTotal, sym)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Transactions</span><span className="font-semibold text-gray-800">{detail.receipts.filter(r => r.status !== 'voided').length}</span></div>
              {detail.receipts.filter(r => r.status === 'voided').length > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Voided</span><span className="font-semibold text-red-500">{detail.receipts.filter(r => r.status === 'voided').length}</span></div>
              )}
              {detail.receipts.some(r => r.discount_amount > 0) && (
                <div className="flex justify-between"><span className="text-gray-500">Total discounts</span><span className="font-semibold text-purple-600">−{fmt(detail.receipts.reduce((s, r) => s + r.discount_amount, 0), sym)}</span></div>
              )}
            </div>
          </div>

          {/* Cash movements */}
          {detail.cashMovements.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-orange-400" />
                <h4 className="text-sm font-semibold text-gray-800">Cash Movements</h4>
              </div>
              <div className="divide-y divide-gray-50">
                {detail.cashMovements.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${m.type === 'cash_in' ? 'bg-blue-100' : 'bg-orange-100'}`}>
                      {m.type === 'cash_in' ? <ArrowDownCircle className="w-3.5 h-3.5 text-blue-600" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-orange-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{m.note || (m.type === 'cash_in' ? 'Cash in' : 'Cash out')}</p>
                      <p className="text-[10px] text-gray-400">{fmtTime(m.created_at)}</p>
                    </div>
                    <span className={`text-sm font-bold flex-shrink-0 ${m.type === 'cash_in' ? 'text-blue-700' : 'text-red-600'}`}>
                      {m.type === 'cash_in' ? '+' : '−'}{fmt(m.amount, sym)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment breakdown */}
          {detail.paymentBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <h4 className="text-sm font-semibold text-gray-800">Payment Methods</h4>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {detail.paymentBreakdown.map((p, i) => {
                  const pct = salesTotal > 0 ? (p.amount / salesTotal) * 100 : 0
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-xs text-gray-600"><PayIcon name={p.name} />{p.name}<span className="text-gray-400">({p.count}×)</span></span>
                        <span className="text-xs font-semibold text-gray-800">{fmt(p.amount, sym)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Products */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Products Sold</h4>
              <span className="text-xs text-gray-400 ml-1">{detail.productSummary.length} items</span>
            </div>
            {detail.productSummary.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No products sold this shift</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {detail.productSummary.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-800 truncate pr-2">{p.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-gray-400">×{p.qty}</span>
                          <span className="text-xs font-semibold text-indigo-600">{fmt(p.revenue, sym)}</span>
                        </div>
                      </div>
                      <MiniBar pct={(p.qty / maxQty) * 100} color={barColors[i % barColors.length]} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {detail.productSummary.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-600">{detail.productSummary.reduce((s, p) => s + p.qty, 0)} items total</span>
                <span className="text-xs font-bold text-indigo-700">{fmt(detail.productSummary.reduce((s, p) => s + p.revenue, 0), sym)}</span>
              </div>
            )}
          </div>
          {shift.note && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Shift Note</p>
              <p className="text-sm text-amber-800">{shift.note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift Grid Card
// ─────────────────────────────────────────────────────────────────────────────
function ShiftGridCard({
  shift, isSelected, onSelect, detail, loadingDetail, currencySymbol,
}: {
  shift: ShiftCard; isSelected: boolean; onSelect: (id: string) => void
  detail: ShiftDetail | null; loadingDetail: boolean; currencySymbol: string
}) {
  const sym = currencySymbol || '₱'
  const isOpen = shift.status === 'open'

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      isSelected ? 'border-indigo-400 shadow-lg shadow-indigo-100/50 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'
    } bg-white`}>
      <button onClick={() => onSelect(shift.id)} className="w-full text-left p-5 focus:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-bold ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              {shift.cashier.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{shift.cashier}</p>
              <p className="text-xs text-gray-400 capitalize">{shift.cashier_role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {isOpen ? <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Active</> : <><CheckCircle2 className="w-3 h-3" />Closed</>}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isSelected ? 'rotate-180 text-indigo-400' : ''}`} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-gray-400" />{fmtDate(shift.clock_in)}</div>
          <span className="text-gray-300">·</span>
          <div className="flex items-center gap-1"><LogIn className="w-3.5 h-3.5 text-emerald-500" />{fmtTime(shift.clock_in)}</div>
          {shift.clock_out && <><span className="text-gray-300">→</span><div className="flex items-center gap-1"><LogOut className="w-3.5 h-3.5 text-gray-400" />{fmtTime(shift.clock_out)}</div></>}
          <span className="text-gray-300">·</span>
          <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{duration(shift.clock_in, shift.clock_out)}</div>
        </div>

        {shift.total_sales !== undefined && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-gray-400 mb-0.5">Sales</p>
              <p className="text-sm font-bold text-indigo-700">{fmt(shift.total_sales!, sym)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-gray-400 mb-0.5">Transactions</p>
              <p className="text-sm font-bold text-gray-700">{shift.total_transactions ?? 0}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-gray-400 mb-0.5">Cash out</p>
              <p className="text-sm font-bold text-orange-600">{fmt(shift.cash_out ?? 0, sym)}</p>
            </div>
          </div>
        )}
      </button>

      {isSelected && (
        <ShiftDetailPanel shift={shift} detail={detail} loadingDetail={loadingDetail} currencySymbol={currencySymbol} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift Logs Tab
// ─────────────────────────────────────────────────────────────────────────────
function ShiftLogsTab({ currencySymbol }: { currencySymbol: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shifts, setShifts] = useState<ShiftCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, ShiftDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [filterDays, setFilterDays] = useState(30)

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: shop } = await supabase.from('shops').select('id').single()
      const since = new Date()
      since.setDate(since.getDate() - filterDays)

      const { data, error: sErr } = await supabase
        .from('shifts')
        .select('id, opening_cash, closing_cash, status, clock_in, clock_out, note, app_users(name, role)')
        .eq('shop_id', shop!.id)
        .gte('clock_in', since.toISOString())
        .order('clock_in', { ascending: false })

      if (sErr) throw sErr

      const shiftIds = (data || []).map((s: any) => s.id)
      let receiptSummaries: Record<string, { total_sales: number; total_transactions: number }> = {}
      let cashOutSummaries: Record<string, number> = {}

      if (shiftIds.length > 0) {
        const [rxRes, movRes] = await Promise.all([
          supabase.from('receipts').select('shift_id, total, status').in('shift_id', shiftIds).neq('status', 'voided'),
          supabase.from('shift_cash_movements').select('shift_id, type, amount').in('shift_id', shiftIds).eq('type', 'cash_out'),
        ])
        for (const r of rxRes.data || []) {
          if (!receiptSummaries[r.shift_id]) receiptSummaries[r.shift_id] = { total_sales: 0, total_transactions: 0 }
          receiptSummaries[r.shift_id].total_sales += Number(r.total)
          receiptSummaries[r.shift_id].total_transactions += 1
        }
        for (const m of movRes.data || []) {
          cashOutSummaries[m.shift_id] = (cashOutSummaries[m.shift_id] || 0) + Number(m.amount)
        }
      }

      setShifts((data || []).map((s: any) => ({
        id: s.id,
        cashier: s.app_users?.name || 'Unknown',
        cashier_role: s.app_users?.role || '',
        clock_in: s.clock_in,
        clock_out: s.clock_out,
        status: s.status as 'open' | 'closed',
        opening_cash: Number(s.opening_cash || 0),
        closing_cash: s.closing_cash !== null ? Number(s.closing_cash) : null,
        note: s.note,
        total_sales: receiptSummaries[s.id]?.total_sales ?? 0,
        total_transactions: receiptSummaries[s.id]?.total_transactions ?? 0,
        cash_out: cashOutSummaries[s.id] ?? 0,
      })))
    } catch (e: any) {
      setError(e.message || 'Failed to load shifts')
    } finally {
      setLoading(false)
    }
  }, [filterDays])

  useEffect(() => { loadShifts() }, [loadShifts])

  const loadDetail = useCallback(async (shiftId: string) => {
    if (detailCache[shiftId]) return
    setLoadingDetail(true)
    try {
      const [rxRes, movRes] = await Promise.all([
        supabase.from('receipts').select('id, receipt_number, total, subtotal, discount_amount, tax_amount, status, created_at, payment_types(name)').eq('shift_id', shiftId).order('created_at'),
        supabase.from('shift_cash_movements').select('id, type, amount, note, created_at').eq('shift_id', shiftId).order('created_at'),
      ])

      const receipts = rxRes.data || []
      let receiptRows: ShiftDetail['receipts'] = []
      if (receipts.length > 0) {
        const { data: items } = await supabase.from('receipt_items').select('receipt_id, item_name, quantity, unit_price, line_total').in('receipt_id', receipts.map((r: any) => r.id))
        const itemsByReceipt: Record<string, any[]> = {}
        for (const it of items || []) {
          if (!itemsByReceipt[it.receipt_id]) itemsByReceipt[it.receipt_id] = []
          itemsByReceipt[it.receipt_id].push(it)
        }
        receiptRows = receipts.map((r: any) => ({
          id: r.id, receipt_number: r.receipt_number, total: Number(r.total), subtotal: Number(r.subtotal),
          discount_amount: Number(r.discount_amount || 0), tax_amount: Number(r.tax_amount || 0),
          status: r.status, payment_name: r.payment_types?.name || 'Cash', created_at: r.created_at,
          items: itemsByReceipt[r.id] || [],
        }))
      }

      const productAgg: Record<string, { qty: number; revenue: number }> = {}
      for (const r of receiptRows.filter(r => r.status !== 'voided')) {
        for (const it of r.items) {
          if (!productAgg[it.item_name]) productAgg[it.item_name] = { qty: 0, revenue: 0 }
          productAgg[it.item_name].qty += it.quantity
          productAgg[it.item_name].revenue += it.line_total
        }
      }
      const productSummary = Object.entries(productAgg).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty)

      const payMap: Record<string, { amount: number; count: number }> = {}
      for (const r of receiptRows.filter(r => r.status !== 'voided')) {
        const pn = r.payment_name
        if (!payMap[pn]) payMap[pn] = { amount: 0, count: 0 }
        payMap[pn].amount += r.total
        payMap[pn].count += 1
      }

      setDetailCache(prev => ({
        ...prev,
        [shiftId]: {
          cashMovements: (movRes.data || []).map((m: any) => ({ id: m.id, type: m.type, amount: Number(m.amount), note: m.note, created_at: m.created_at })),
          receipts: receiptRows,
          productSummary,
          paymentBreakdown: Object.entries(payMap).map(([name, v]) => ({ name, ...v })),
        },
      }))
    } catch (e: any) {
      setError(e.message || 'Failed to load shift details')
    } finally {
      setLoadingDetail(false)
    }
  }, [detailCache])

  function handleSelect(id: string) {
    if (selectedId === id) { setSelectedId(null) } else { setSelectedId(id); loadDetail(id) }
  }

  const visibleShifts = shifts.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (search && !s.cashier.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalSales = shifts.reduce((s, sh) => s + (sh.total_sales ?? 0), 0)
  const openShifts = shifts.filter(s => s.status === 'open').length
  const DAY_OPTIONS = [7, 14, 30, 60, 90]

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Shifts', value: String(shifts.length), icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Active Now', value: String(openShifts), icon: User, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Period Sales', value: fmt(totalSales, currencySymbol), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 ${c.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div>
              <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by cashier…" className="text-sm border-none outline-none bg-transparent w-full" />
          {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-gray-400" /></button>}
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-medium">
          {(['all', 'open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 capitalize transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{s}</button>
          ))}
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-medium">
          {DAY_OPTIONS.map(d => (
            <button key={d} onClick={() => setFilterDays(d)} className={`px-3 py-2 transition-colors ${filterDays === d ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{d}d</button>
          ))}
        </div>
        <button onClick={loadShifts} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading shifts…
        </div>
      ) : visibleShifts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No shifts found</p>
          <p className="text-sm text-gray-400 mt-1">{search ? 'Try a different search' : `No shifts in the last ${filterDays} days`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleShifts.map(shift => (
            <ShiftGridCard
              key={shift.id} shift={shift} isSelected={selectedId === shift.id}
              onSelect={handleSelect} detail={detailCache[shift.id] || null}
              loadingDetail={loadingDetail && selectedId === shift.id}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      )}

      {!loading && visibleShifts.length > 0 && (
        <p className="text-center text-xs text-gray-400">
          Showing {visibleShifts.length} of {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
          {filterStatus !== 'all' ? ` (${filterStatus})` : ''} · last {filterDays} days
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createClient()
  const { currencySymbol } = useShop()

  const [activeTab, setActiveTab] = useState<'transactions' | 'shifts'>('transactions')
  const [dateRange, setDateRange] = useState<DateRange>(PRESETS[2])
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [isLoading, setIsLoading] = useState(true)

  const [receipts, setReceipts] = useState<any[]>([])
  const [cashMovements, setCashMovements] = useState<any[]>([])
  const [receiptItems, setReceiptItems] = useState<Record<string, any[]>>({})

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const fromTs = `${dateRange.from}T00:00:00`
    const toTs   = `${dateRange.to}T23:59:59`

    const [receiptsRes, movementsRes] = await Promise.all([
      supabase.from('receipts').select('*, app_users:employee_id(name), payment_types(name), shifts!inner(app_users(name))').gte('created_at', fromTs).lte('created_at', toTs).order('created_at'),
      supabase.from('shift_cash_movements').select('*, shifts!inner(app_users(name))').gte('created_at', fromTs).lte('created_at', toTs).order('created_at'),
    ])

    const rxs = receiptsRes.data || []
    const mvs = movementsRes.data || []
    setReceipts(rxs)
    setCashMovements(mvs)

    if (rxs.length > 0) {
      const { data: items } = await supabase.from('receipt_items').select('*').in('receipt_id', rxs.map((r: any) => r.id))
      const byReceipt: Record<string, any[]> = {}
      for (const item of items || []) {
        if (!byReceipt[item.receipt_id]) byReceipt[item.receipt_id] = []
        byReceipt[item.receipt_id].push(item)
      }
      setReceiptItems(byReceipt)
    } else {
      setReceiptItems({})
    }
    setIsLoading(false)
  }, [dateRange.from, dateRange.to])

  useEffect(() => { loadData() }, [loadData])

  const activeReceipts = useMemo(() => receipts.filter(r => r.status !== 'voided'), [receipts])
  const voidedReceipts = useMemo(() => receipts.filter(r => r.status === 'voided'), [receipts])
  const grossSales   = useMemo(() => activeReceipts.reduce((s, r) => s + Number(r.total), 0), [activeReceipts])
  const refundTotal  = useMemo(() => voidedReceipts.reduce((s, r) => s + Number(r.total), 0), [voidedReceipts])
  const netSales     = grossSales - refundTotal
  const cashInTotal  = useMemo(() => cashMovements.filter(m => m.type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0), [cashMovements])
  const cashOutTotal = useMemo(() => cashMovements.filter(m => m.type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0), [cashMovements])
  const totalTxCount = activeReceipts.length
  const avgSale      = totalTxCount > 0 ? netSales / totalTxCount : 0

  const allTransactions = useMemo<UnifiedTx[]>(() => {
    const sorted = [...receipts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const refMap: Record<string, string> = {}
    sorted.forEach((r, idx) => { refMap[r.id] = buildRefNumber(new Date(r.created_at), idx + 1) })
    return [
      ...receipts.map(r => ({ ...r, _type: (r.status === 'voided' ? 'refund' : 'sale') as UnifiedTx['_type'], _time: new Date(r.created_at), _ref: refMap[r.id] || '—', _staff: r.app_users?.name || r.shifts?.app_users?.name || '—', _items: receiptItems[r.id] || [] })),
      ...cashMovements.map(m => ({ ...m, _type: m.type as UnifiedTx['_type'], _time: new Date(m.created_at), _ref: '—', _staff: m.shifts?.app_users?.name || '—', _items: [] })),
    ].sort((a, b) => a._time.getTime() - b._time.getTime())
  }, [receipts, cashMovements, receiptItems])

  const TABS = [
    { id: 'transactions', label: 'Transactions', icon: Receipt },
    { id: 'shifts',       label: 'Shift Logs',   icon: Clock },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 space-y-5">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeTab === 'transactions'
                ? `${dateRange.label} · ${dateRange.from} → ${dateRange.to}`
                : 'Shift session history'}
            </p>
          </div>
          {activeTab === 'transactions' && (
            <div className="flex items-center gap-2">
              <button onClick={loadData} className="p-2 rounded-xl border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <DateRangeFilter presets={PRESETS} selected={dateRange} onSelect={setDateRange} groupBy={groupBy} onGroupByChange={setGroupBy} />
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'transactions' && (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Gross Sales" value={`${currencySymbol}${grossSales.toFixed(2)}`} sub={`${activeReceipts.length} sale${activeReceipts.length !== 1 ? 's' : ''}`} icon={TrendingUp} bg="bg-indigo-50" text="text-indigo-600" isLoading={isLoading} />
              <KpiCard label="Net Sales" value={`${currencySymbol}${netSales.toFixed(2)}`} sub={refundTotal > 0 ? `−${currencySymbol}${refundTotal.toFixed(2)} refunded` : 'No refunds'} icon={DollarSign} bg="bg-emerald-50" text="text-emerald-600" isLoading={isLoading} />
              <KpiCard label="Cash Out (Expenses)" value={`${currencySymbol}${cashOutTotal.toFixed(2)}`} sub={`${cashMovements.filter(m => m.type === 'cash_out').length} movement(s)`} icon={ArrowUpCircle} bg="bg-orange-50" text="text-orange-600" isLoading={isLoading} />
              <KpiCard label="Transactions" value={String(totalTxCount)} sub={`${voidedReceipts.length} voided · ${cashMovements.length} cash moves`} icon={Receipt} bg="bg-violet-50" text="text-violet-600" isLoading={isLoading} />
              <KpiCard label="Avg. Sale" value={`${currencySymbol}${avgSale.toFixed(2)}`} sub="per active transaction" icon={BarChart2} bg="bg-sky-50" text="text-sky-600" isLoading={isLoading} />
            </div>

            {/* Transactions table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-800">All Transactions</h2>
                </div>
                <span className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">{allTransactions.length} entries</span>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '520px' }}>
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {['Date & Time', 'Ref #', 'Type', 'Items / Note', 'Payment', 'Staff', 'Amount'].map((h, i) => (
                        <th key={h} className={`sticky top-0 z-20 bg-gray-50 px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200 ${i === 6 ? 'text-right' : 'text-left'} ${i === 4 ? 'hidden sm:table-cell' : ''} ${i === 5 ? 'hidden md:table-cell' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-3 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))}
                    {!isLoading && allTransactions.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-16 text-gray-400"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />No transactions in this date range</td></tr>
                    )}
                    {!isLoading && allTransactions.map((tx) => {
                      const isSale = tx._type === 'sale'
                      const isRefund = tx._type === 'refund'
                      const isCashIn = tx._type === 'cash_in'
                      const isPositive = isSale || isCashIn
                      const amountValue = Number(tx.total ?? tx.amount ?? 0)
                      return (
                        <tr key={`${tx._type}-${tx.id}`} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-medium text-gray-700">{tx._time.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            <div className="text-gray-400 text-[10px]">{tx._time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">{tx._ref}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap"><TypeBadge type={tx._type} /></td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                            {(isSale || isRefund) ? (
                              <div className="space-y-0.5">
                                {(tx._items || []).map((it, j) => <div key={j} className="truncate text-gray-700">{it.quantity}× {it.item_name}</div>)}
                                {tx.note && <div className="text-amber-600 truncate text-[10px]">📝 {tx.note}</div>}
                                {isRefund && (tx as any).void_note && <div className="text-red-400 truncate text-[10px]">{(tx as any).void_note}</div>}
                              </div>
                            ) : <span className="text-gray-400 italic">{tx.note || '—'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap hidden sm:table-cell">{(isSale || isRefund) ? (tx as any).payment_types?.name || 'Cash' : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap hidden md:table-cell">{tx._staff}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                            {isPositive ? '+' : '−'}{currencySymbol}{amountValue.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {!isLoading && allTransactions.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                        <td colSpan={6} className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-right">Net Sales Total</td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-700">{currencySymbol}{netSales.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'shifts' && <ShiftLogsTab currencySymbol={currencySymbol} />}

      </div>
    </div>
  )
}
