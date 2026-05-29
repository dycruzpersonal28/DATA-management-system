'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Receipt, Repeat, X, ChevronDown, Wallet,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type EntryType = 'expense' | 'other_income' | 'labor' | 'capital'

type JournalEntry = {
  id: string
  type: EntryType
  category: string
  amount: number
  description: string | null
  reference_no: string | null
  date: string
  is_recurring: boolean
  recurring_day: number | null
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Electricity', 'Water', 'Internet',
  'Supplies', 'Repairs & Maintenance', 'Marketing', 'Transportation',
  'Licenses & Permits', 'Insurance', 'Cleaning', 'Packaging',
  'Equipment', 'Professional Fees', 'Other Expense',
]

const INCOME_CATEGORIES = [
  'Venue Rental', 'Event Income', 'Catering', 'Sponsorship',
  'Delivery Income', 'Interest Income', 'Owner Contribution',
  'Loan Proceeds', 'Other Income',
]

const LABOR_CATEGORIES = ['Freelance', 'Casual Staff', 'Overtime Adjustment', 'Other Labor']
const CAPITAL_CATEGORIES = ['Owner Investment', 'Loan', 'Asset Sale', 'Loan Repayment', 'Owner Withdrawal']

function categoriesFor(type: EntryType) {
  if (type === 'expense') return EXPENSE_CATEGORIES
  if (type === 'other_income') return INCOME_CATEGORIES
  if (type === 'labor') return LABOR_CATEGORIES
  return CAPITAL_CATEGORIES
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function today() { return toDateStr(new Date()) }

function fmt(n: number) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Type config ────────────────────────────────────────────────────────────────
const TYPE_META: Record<EntryType, {
  label: string
  icon: any
  accent: string
  badge: string
  direction: 'out' | 'in'
}> = {
  expense: {
    label: 'Expense',
    icon: TrendingDown,
    accent: 'bg-red-50 border-red-200 text-red-700',
    badge: 'bg-red-100 text-red-700',
    direction: 'out',
  },
  other_income: {
    label: 'Other Income',
    icon: TrendingUp,
    accent: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    direction: 'in',
  },
  labor: {
    label: 'Manual Labor',
    icon: Wallet,
    accent: 'bg-pink-50 border-pink-200 text-pink-700',
    badge: 'bg-pink-100 text-pink-700',
    direction: 'out',
  },
  capital: {
    label: 'Capital / Loan',
    icon: Receipt,
    accent: 'bg-blue-50 border-blue-200 text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    direction: 'in',
  },
}

// ── Summary strip ─────────────────────────────────────────────────────────────
function SummaryStrip({ entries }: { entries: JournalEntry[] }) {
  const totalExpense    = entries.filter(e => e.type === 'expense' || e.type === 'labor').reduce((s, e) => s + Number(e.amount), 0)
  const totalIncome     = entries.filter(e => e.type === 'other_income').reduce((s, e) => s + Number(e.amount), 0)
  const totalCapital    = entries.filter(e => e.type === 'capital').reduce((s, e) => s + Number(e.amount), 0)
  const net             = totalIncome - totalExpense

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Other Income', value: totalIncome,  color: 'text-emerald-700', bg: 'bg-emerald-50', Icon: TrendingUp },
        { label: 'Expenses & Labor', value: totalExpense, color: 'text-red-600',     bg: 'bg-red-50',     Icon: TrendingDown },
        { label: 'Capital / Loans', value: totalCapital, color: 'text-blue-600',    bg: 'bg-blue-50',    Icon: Receipt },
        { label: 'Net (this view)',  value: net,          color: net >= 0 ? 'text-emerald-700' : 'text-red-600', bg: net >= 0 ? 'bg-emerald-50' : 'bg-red-50', Icon: net >= 0 ? TrendingUp : TrendingDown },
      ].map(({ label, value, color, bg, Icon }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <p className={`text-xl font-semibold ${color} truncate`}>{fmt(value)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Entry row ─────────────────────────────────────────────────────────────────
function EntryRow({ entry, onDelete }: { entry: JournalEntry; onDelete: (id: string) => void }) {
  const meta = TYPE_META[entry.type]
  const Icon = meta.icon
  const isOut = meta.direction === 'out'

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(entry.date)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{entry.category}</td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-[240px] truncate">{entry.description || '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{entry.reference_no || '—'}</td>
      <td className="px-4 py-3 text-right">
        {entry.is_recurring && (
          <Repeat className="w-3 h-3 text-indigo-400 inline mr-2" aria-label="Recurring" />
        )}
        <span className={`text-sm font-semibold ${isOut ? 'text-red-600' : 'text-emerald-700'}`}>
          {isOut ? '−' : '+'}{fmt(entry.amount)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onDelete(entry.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
          title="Delete entry"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

// ── Add entry modal ───────────────────────────────────────────────────────────
function AddEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType]           = useState<EntryType>('expense')
  const [category, setCategory]   = useState('')
  const [customCat, setCustomCat] = useState('')
  const [amount, setAmount]       = useState('')
  const [description, setDesc]    = useState('')
  const [referenceNo, setRef]     = useState('')
  const [date, setDate]           = useState(today())
  const [isRecurring, setRecur]   = useState(false)
  const [recurDay, setRecurDay]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const cats = categoriesFor(type)
  const effectiveCat = category === '__custom__' ? customCat : category
  const meta = TYPE_META[type]

  // Reset category when type changes
  useEffect(() => { setCategory('') }, [type])

  async function handleSubmit() {
    if (!effectiveCat || !amount || !date) {
      setError('Category, amount, and date are required.')
      return
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Amount must be a positive number.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          category: effectiveCat,
          amount: Number(amount),
          description: description || null,
          reference_no: referenceNo || null,
          date,
          is_recurring: isRecurring,
          recurring_day: isRecurring && recurDay ? Number(recurDay) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Journal Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Entry type toggle */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Entry type</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(TYPE_META) as [EntryType, typeof TYPE_META[EntryType]][]).map(([key, m]) => {
                const Icon = m.icon
                const active = type === key
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      active ? m.accent : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 pr-8"
              >
                <option value="">Select category...</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Custom category</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {category === '__custom__' && (
              <input
                type="text"
                placeholder="Enter custom category..."
                value={customCat}
                onChange={e => setCustomCat(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Amount (₱)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. MERALCO bill May, venue hire for birthday party…"
              value={description}
              onChange={e => setDesc(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Reference No */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Reference / Receipt # <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="OR-0001, INV-2024-05…"
              value={referenceNo}
              onChange={e => setRef(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-indigo-400" />
                Monthly recurring
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Auto-reminder for fixed monthly costs</p>
            </div>
            <button
              onClick={() => setRecur(r => !r)}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${isRecurring ? 'bg-indigo-500' : 'bg-gray-300'}`}
              style={{ height: 22, width: 40 }}
            >
              <span
                className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`}
                style={{ width: 18, height: 18 }}
              />
            </button>
          </div>

          {isRecurring && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Day of month to recur</label>
              <input
                type="number"
                min="1"
                max="28"
                placeholder="e.g. 1 for 1st of every month"
                value={recurDay}
                onChange={e => setRecurDay(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [entries, setEntries]   = useState<JournalEntry[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showModal, setModal]   = useState(false)
  const [filterType, setFilter] = useState<EntryType | 'all'>('all')
  const [dateFrom, setFrom]     = useState(() => {
    const d = new Date(); d.setDate(1)
    return toDateStr(d) // default: start of current month
  })
  const [dateTo, setTo]         = useState(today)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (filterType !== 'all') params.set('type', filterType)
      const res = await fetch(`/api/journal?${params}`)
      if (!res.ok) throw new Error('Failed to load entries')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, filterType])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry? This will also remove it from financial reports.')) return
    try {
      await fetch(`/api/journal?id=${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      alert('Failed to delete entry.')
    }
  }

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.type === filterType)

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Journal Entries</h1>
          <p className="text-sm text-gray-500 mt-0.5">Expenses, other income, and manual entries — all flow into your P&L</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* Date range */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-500">From</span>
          <input
            type="date" value={dateFrom}
            onChange={e => setFrom(e.target.value)}
            className="text-sm border-none outline-none bg-transparent"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date" value={dateTo}
            onChange={e => setTo(e.target.value)}
            className="text-sm border-none outline-none bg-transparent"
          />
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {(['all', 'expense', 'other_income', 'labor', 'capital'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All' : TYPE_META[f].label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Summary strip — uses all entries (unfiltered by type) */}
      {entries.length > 0 && <SummaryStrip entries={entries} />}

      {/* Entry table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </h2>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No entries yet</p>
            <p className="text-sm text-gray-400 mt-1">Click "New Entry" to log an expense, income, or other transaction</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date', 'Type', 'Category', 'Description', 'Ref #', 'Amount', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(e => (
                  <EntryRow key={e.id} entry={e} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AddEntryModal
          onClose={() => setModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
