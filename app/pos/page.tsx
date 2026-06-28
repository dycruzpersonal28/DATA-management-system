'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { useShop } from '@/lib/hooks/useShop'
import Cart from '@/components/pos/Cart'
import {
  ArrowLeft, Tag, ChevronLeft, Search, LayoutGrid, List, X, Monitor,
  ChevronRight, Plus, Minus, Clock, DollarSign, Ticket,
  UtensilsCrossed, LogIn, LogOut, ArrowDownCircle, ArrowUpCircle,
  Save, FolderOpen, Trash2, AlertTriangle, TrendingUp, ShoppingCart,
  LayoutDashboard,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────
type Variant = { id: string; name: string; price: number; cost: number }
type AddonItem = {
  id: string
  name: string
  price: number
  selected: boolean
  quantity: number
  outOfStock?: boolean
  canMake?: number | null
}
type AddonCategory = { id: string; name: string; items: AddonItem[] }

// ── Expense categories (mirrors Finance/Journal page) ─────────────────────────
const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Electricity', 'Water', 'Internet',
  'Supplies', 'Repairs & Maintenance', 'Marketing', 'Transportation',
  'Licenses & Permits', 'Insurance', 'Cleaning', 'Packaging',
  'Equipment', 'Professional Fees', 'Other Expense',
]

type PickerProps = {
  item: any
  variants: Variant[]
  addonCategories: AddonCategory[]
  onConfirm: (variant: Variant | null, note: string, addons: AddonItem[]) => void
  onClose: () => void
  currencySymbol: string
  variantAvailability?: Map<string, number | null>
  addonAvailability?: AvailabilityMap
}

// availability: how many of this item can be made; null = no ingredient tracking
type AvailabilityInfo = {
  canMake: number | null       // null = unlimited (no ingredients defined)
  shortages: { ingredient: string; have: number; need: number; unit: string }[]
}
// Note: unit field is kept for future use; currently empty string since schema has no unit column
type AvailabilityMap = Map<string, AvailabilityInfo>

// ── Variant Picker Modal ──────────────────────────────────────────────────────
function VariantPickerModal({ item, variants, addonCategories, onConfirm, onClose, currencySymbol, variantAvailability, addonAvailability }: PickerProps) {
  const [selected, setSelected] = useState<Variant | null>(null)
  const [note, setNote] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [catItems, setCatItems] = useState<Map<string, AddonItem[]>>(() => {
    const m = new Map<string, AddonItem[]>()
    for (const cat of addonCategories) {
      m.set(cat.id, cat.items.map(a => {
        const avail = addonAvailability?.get(a.id)
        return {
          ...a,
          outOfStock: avail ? avail.canMake === 0 : false,
          canMake: avail ? avail.canMake : null,
        }
      }))
    }
    return m
  })

  const hasVariants = variants.length > 0
  const hasAddons = addonCategories.length > 0

  const allSelectedAddons = Array.from(catItems.values()).flat().filter(a => a.selected)
  const addonsTotal = allSelectedAddons.reduce((sum, a) => sum + a.price * a.quantity, 0)
  const basePrice = selected ? selected.price : Number(item.price)
  const grandTotal = basePrice + addonsTotal

  function toggleCat(catId: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(catId) ? next.delete(catId) : next.add(catId)
      return next
    })
  }
  function toggleAddon(catId: string, addonId: string) {
    setCatItems(prev => {
      const next = new Map(prev)
      const items = (next.get(catId) || []).map(a => {
        if (a.id !== addonId) return a
        if (a.outOfStock && !a.selected) return a // block selecting OOS addons
        return { ...a, selected: !a.selected, quantity: !a.selected ? 1 : 0 }
      })
      next.set(catId, items)
      return next
    })
  }
  function changeQty(catId: string, addonId: string, delta: number) {
    setCatItems(prev => {
      const next = new Map(prev)
      const items = (next.get(catId) || []).map(a =>
        a.id === addonId ? { ...a, quantity: Math.max(1, a.quantity + delta) } : a
      )
      next.set(catId, items)
      return next
    })
  }
  function handleConfirm() {
    if (hasVariants && !selected) { toast.error('Please select a variant'); return }
    if (selected) {
      const canMake = variantAvailability?.get(selected.id)
      if (canMake === 0) { toast.error(`"${selected.name}" is out of stock`); return }
    }
    onConfirm(selected, note, allSelectedAddons)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
            {hasVariants && <p className="text-xs text-gray-400 mt-0.5">Select a variant to continue</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {hasVariants && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Variants</p>
              <div className="space-y-2">
                {variants.map(v => {
                  const canMake = variantAvailability?.get(v.id)
                  const outOfStock = canMake === 0
                  const lowStock = canMake !== undefined && canMake !== null && canMake > 0 && canMake <= 3
                  const hasIngredients = canMake !== undefined
                  return (
                    <button
                      key={v.id}
                      onClick={() => { if (!outOfStock) setSelected(v) }}
                      disabled={outOfStock}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                        outOfStock
                          ? 'border-red-200 opacity-50 cursor-not-allowed'
                          : selected?.id === v.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{v.name}</span>
                        {hasIngredients && (
                          <span className={`inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            outOfStock
                              ? 'bg-red-100 text-red-600'
                              : lowStock
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${outOfStock ? 'bg-red-500' : lowStock ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {outOfStock ? 'Out of stock' : canMake === null ? 'In stock' : `${canMake} available`}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ${selected?.id === v.id ? 'text-indigo-600' : 'text-gray-600'}`}>{currencySymbol}{Number(v.price).toFixed(2)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {hasAddons && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Add-Ons</p>
              <div className="space-y-2">
                {addonCategories.map(cat => {
                  const items = catItems.get(cat.id) || []
                  const selectedInCat = items.filter(a => a.selected)
                  const isOpen = expandedCats.has(cat.id)
                  return (
                    <div key={cat.id} className={`rounded-xl border transition-all overflow-hidden ${selectedInCat.length > 0 ? 'border-indigo-300' : 'border-gray-200'}`}>
                      {/* Category header row — always visible */}
                      <button
                        onClick={() => toggleCat(cat.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left ${isOpen ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 truncate">{cat.name}</span>
                          {selectedInCat.length > 0 && (
                            <span className="flex-shrink-0 px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                              {selectedInCat.length}
                            </span>
                          )}
                        </div>
                        <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                      {/* Selected summary chips — shown when collapsed */}
                      {!isOpen && selectedInCat.length > 0 && (
                        <div className="px-3 pb-2 flex flex-wrap gap-1">
                          {selectedInCat.map(a => (
                            <span key={a.id} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                              {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Expanded items list */}
                      {isOpen && (
                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {items.map(a => (
                            <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${a.outOfStock ? 'opacity-50' : a.selected ? 'bg-indigo-50' : 'bg-white'}`}>
                              <button
                                onClick={() => !a.outOfStock && toggleAddon(cat.id, a.id)}
                                disabled={a.outOfStock}
                                className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${a.outOfStock ? 'border-gray-200 cursor-not-allowed' : a.selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}
                              >
                                {a.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </button>
                              <div className="flex-1 min-w-0" onClick={() => !a.outOfStock && toggleAddon(cat.id, a.id)}>
                                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {a.price > 0 && <p className="text-xs text-indigo-600 font-semibold">+{currencySymbol}{Number(a.price).toFixed(2)}</p>}
                                  {a.outOfStock ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Out of stock
                                    </span>
                                  ) : a.canMake !== null && a.canMake !== undefined ? (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${a.canMake <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${a.canMake <= 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} /> {a.canMake} available
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {a.selected && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button onClick={() => changeQty(cat.id, a.id, -1)} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                                  <span className="text-sm font-medium w-4 text-center">{a.quantity}</span>
                                  <button onClick={() => changeQty(cat.id, a.id, 1)} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Note <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
            <textarea rows={2} placeholder="e.g. No onions, extra sauce…" value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-300" />
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{item.name}{selected ? ` (${selected.name})` : ''}{allSelectedAddons.length > 0 ? ` + ${allSelectedAddons.length} add-on${allSelectedAddons.length > 1 ? 's' : ''}` : ''}</span>
            <span className="font-semibold text-gray-900">{currencySymbol}{grandTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleConfirm} disabled={hasVariants && !selected} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              Add to cart <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── POS Terminal Picker Modal ─────────────────────────────────────────────────
function TerminalPickerModal({
  terminals,
  onSelect,
  onClose,
}: {
  terminals: any[]
  onSelect: (terminal: any) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Monitor className="w-4 h-4 text-indigo-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Select POS Terminal</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Choose which terminal this shift will run on.</p>
        {terminals.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">
            No active terminals found. Add terminals in Users & POS Settings.
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {terminals.map(t => (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-xl text-left transition-all"
              >
                <Monitor className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">{t.name}</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ── Shift Clock-In Modal ──────────────────────────────────────────────────────
function ShiftModal({
  mode,
  currentUser,
  currencySymbol,
  onClockIn,
  onClockOut,
  onCashIn,
  onCashOut,
  onClose,
}: {
  mode: 'clockin' | 'clockout' | 'cashin' | 'cashout'
  currentUser: any
  currencySymbol: string
  onClockIn: (openingCash: number) => void
  onClockOut: (shiftId: string, closingCash: number, note: string) => void
  onCashIn: (shiftId: string, amount: number, note: string) => void
  onCashOut: (shiftId: string, amount: number, note: string, category: string) => void
  onClose: () => void
}) {
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [activeShiftId, setActiveShiftId] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (mode !== 'clockin' && currentUser?.id) {
      supabase.from('shifts').select('*')
        .eq('status', 'open')
        .eq('app_user_id', currentUser.id)
        .order('clock_in', { ascending: false })
        .limit(1).maybeSingle()
        .then(({ data }) => { if (data) setActiveShiftId(data.id) })
    }
  }, [mode, currentUser])

  const title = { clockin: 'Open Shift', clockout: 'Close Shift', cashin: 'Cash In', cashout: 'Cash Out' }[mode]
  const icon = { clockin: LogIn, clockout: LogOut, cashin: ArrowDownCircle, cashout: ArrowUpCircle }[mode]
  const IconComp = icon

  function handleSubmit() {
    if (mode === 'clockin') {
      onClockIn(parseFloat(openingCash) || 0)
    } else if (mode === 'clockout') {
      onClockOut(activeShiftId, parseFloat(closingCash) || 0, note)
    } else if (mode === 'cashin') {
      if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return }
      onCashIn(activeShiftId, parseFloat(amount), note)
    } else if (mode === 'cashout') {
      if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return }
      if (!expenseCategory) { toast.error('Select an expense category'); return }
      onCashOut(activeShiftId, parseFloat(amount), note, expenseCategory)
    }
  }

  const colorMap = {
    clockin: 'bg-green-100 text-green-600',
    clockout: 'bg-red-100 text-red-600',
    cashin: 'bg-blue-100 text-blue-600',
    cashout: 'bg-orange-100 text-orange-600',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[mode]}`}>
            <IconComp className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          {mode === 'clockin' && (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                  {currentUser?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{currentUser?.name || 'Unknown'}</p>
                  <p className="text-xs text-gray-400 capitalize">{currentUser?.role}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Opening Cash ({currencySymbol})</label>
                <input type="number" min="0" step="0.01" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0.00" autoFocus className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </>
          )}
          {mode === 'clockout' && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Closing Cash ({currencySymbol})</label>
              <input type="number" min="0" step="0.01" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="0.00" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          )}
          {(mode === 'cashin' || mode === 'cashout') && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Amount ({currencySymbol})</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          )}
          {mode === 'cashout' && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Expense Category <span className="text-red-400">*</span></label>
              <select
                value={expenseCategory}
                onChange={e => setExpenseCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">Select category...</option>
                {EXPENSE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
          {(mode === 'clockout' || mode === 'cashin' || mode === 'cashout') && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Note <span className="text-gray-300 font-normal">(optional)</span></label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dining Option Modal ───────────────────────────────────────────────────────
function DiningOptionModal({ options, onSelect, onSkip }: { options: any[]; onSelect: (opt: any) => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-teal-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Dining Option</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">Select how this order will be served.</p>
        <div className="space-y-2 mb-4">
          {options.map(opt => (
            <button key={opt.id} onClick={() => onSelect(opt)} className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-teal-50 border border-gray-200 hover:border-teal-300 rounded-xl text-sm font-medium text-gray-800 transition-all">
              {opt.name}
            </button>
          ))}
        </div>
        <button onClick={onSkip} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">Skip for now</button>
      </div>
    </div>
  )
}

// ── Open Tickets Modal ────────────────────────────────────────────────────────
function OpenTicketsModal({
  tickets,
  currencySymbol,
  shopTimezone,
  onLoad,
  onDelete,
  onClose,
}: {
  tickets: any[]
  currencySymbol: string
  shopTimezone: string
  onLoad: (ticket: any) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style={{ maxHeight: '75vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Open Tickets</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tickets.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No saved tickets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <div key={t.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.name || `Ticket #${t.ticket_number}`}</p>
                      {t.dining_option_name && (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium flex-shrink-0">{t.dining_option_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{t.item_count} item{t.item_count !== 1 ? 's' : ''} · {currencySymbol}{Number(t.total).toFixed(2)}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{new Intl.DateTimeFormat('en-US', { timeZone: shopTimezone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t.created_at))}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => onLoad(t)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors">
                      <FolderOpen className="w-3.5 h-3.5" /> Load
                    </button>
                    <button onClick={() => onDelete(t.id)} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Save Ticket Modal ─────────────────────────────────────────────────────────
function SaveTicketModal({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Save className="w-4 h-4 text-purple-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Save Ticket</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">Ticket name <span className="text-gray-300 font-normal">(optional)</span></label>
        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave(name)} placeholder="e.g. Table 3, John" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-5" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(name)} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cart Bottom Sheet (tablet) ────────────────────────────────────────────────
function CartBottomSheet({
  open,
  onClose,
  cartItemCount,
  cartTotal,
  currencySymbol,
  diningOption,
  activeShiftId,
  cashierName,
  onEditItem,
  onPaymentComplete,
}: {
  open: boolean
  onClose: () => void
  cartItemCount: number
  cartTotal: number
  currencySymbol: string
  diningOption?: any
  activeShiftId?: string | null
  cashierName?: string
  onEditItem?: (cartItemId: string) => void
  onPaymentComplete?: () => void
}) {
  return (
    <>
      {/* Backdrop — only visible when sheet is open */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Bottom sheet — tablet & mobile */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200
          transition-transform duration-300 ease-in-out
          lg:hidden
          flex flex-col overflow-hidden
          ${open ? 'translate-y-0' : 'translate-y-full'}
        `}
        style={{ maxHeight: '80vh' }}
      >
        {/* Drag handle + header */}
        <div className="flex flex-col items-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mb-3" />
          <div className="w-full flex items-center justify-between px-4 pb-2">
            <span className="text-sm font-semibold text-gray-900">Order</span>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cart content fills remaining space */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Cart
            diningOption={diningOption}
            activeShiftId={activeShiftId}
            cashierName={cashierName}
            onEditItem={onEditItem}
            onPaymentComplete={() => {
              onClose()
              onPaymentComplete?.()
            }}
          />
        </div>
      </div>
    </>
  )
}

// ── Main POS Page ─────────────────────────────────────────────────────────────
export default function POSPage() {
  const supabase = createClient()
  const router = useRouter()
  const { addItem, updateItem, items: cartItems, clearCart, loadItems } = useCart()
  const { currencySymbol } = useShop()

  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [userName, setUserName] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const [shopId, setShopId] = useState('')
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')

  // Feature flags
  const [featureShifts, setFeatureShifts] = useState(false)
  const [featureDiningOptions, setFeatureDiningOptions] = useState(false)
  const [featureOpenTickets, setFeatureOpenTickets] = useState(false)

  // Shift state
  const [activeShift, setActiveShift] = useState<any | null>(null)
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [shiftModal, setShiftModal] = useState<'clockin' | 'clockout' | 'cashin' | 'cashout' | null>(null)

  // Dining options
  const [diningOptions, setDiningOptions] = useState<any[]>([])
  const [showDiningModal, setShowDiningModal] = useState(false)
  const [selectedDiningOption, setSelectedDiningOption] = useState<any | null>(null)

  // Open tickets
  const [openTickets, setOpenTickets] = useState<any[]>([])
  const [showTicketsModal, setShowTicketsModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)

  // POS terminal
  const [posTerminals, setPosTerminals] = useState<any[]>([])
  const [showTerminalPicker, setShowTerminalPicker] = useState(false)
  const [selectedTerminal, setSelectedTerminal] = useState<any | null>(null)

  // Picker
  const [pickerItem, setPickerItem] = useState<any | null>(null)
  const [pickerVariants, setPickerVariants] = useState<Variant[]>([])
  const [pickerAddonCategories, setPickerAddonCategories] = useState<AddonCategory[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  // When set, picker edits an existing cart item instead of adding a new one
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null)

  // Cart bottom sheet (tablet)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  // Inventory availability
  const [availabilityMap, setAvailabilityMap] = useState<AvailabilityMap>(new Map())
  // Per-variant availability (variant_id -> canMake). Kept separate from the
  // item-level map above, which collapses multiple variants down to "best variant
  // wins" for the grid badge — the picker needs the un-collapsed per-variant numbers.
  const [variantAvailabilityMap, setVariantAvailabilityMap] = useState<Map<string, number | null>>(new Map())

  // Addon category counts per item
  const [addonCatCounts, setAddonCatCounts] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedTime = now ? new Intl.DateTimeFormat('en-US', { timeZone: shopTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now) : ''
  const formattedDate = now ? new Intl.DateTimeFormat('en-US', { timeZone: shopTimezone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(now) : ''

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (appUser) {
        setCurrentUser(appUser)
        setUserName(appUser.name)
      } else {
        router.push('/login')
        return
      }

      const shopId = appUser?.shop_id
      if (!shopId) return

      const { data: shop } = await supabase.from('shops').select('*').eq('id', shopId).single()
      if (!shop) return
      setShopId(shop.id)
      if (shop.timezone) setShopTimezone(shop.timezone)

      setFeatureShifts(shop.feature_shifts === true)
      setFeatureDiningOptions(shop.feature_dining_options === true)
      setFeatureOpenTickets(shop.feature_open_tickets === true)

      const { data: cats } = await supabase.from('categories').select('*').eq('shop_id', shop.id).eq('show_in_pos', true).order('sort_order')
      const { data: itms } = await supabase
        .from('items')
        .select('*, categories!items_category_id_fkey(name, color), item_levels!items_level_id_fkey(id, is_sellable)')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('name')

      setCategories(cats || [])
      setItems((itms || []).filter((i: any) => {
        const level = i.item_levels
        return !level || level.is_sellable === true
      }))
      setLoading(false)

      // Fetch addon category counts per item
      const { data: addonCats } = await supabase
        .from('item_addon_categories')
        .select('item_id, category_id')
        .eq('shop_id', shop.id)

      const countMap = new Map<string, number>()
      for (const row of addonCats || []) {
        countMap.set(row.item_id, (countMap.get(row.item_id) ?? 0) + 1)
      }
      setAddonCatCounts(countMap)

      if (shop.feature_shifts) {
        const { data: shift } = await supabase
          .from('shifts')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('status', 'open')
          .eq('app_user_id', appUser.id)
          .order('clock_in', { ascending: false })
          .limit(1)
          .maybeSingle()
        setActiveShift(shift || null)
      }

      if (shop.feature_dining_options) {
        const { data: opts } = await supabase
          .from('dining_options')
          .select('*')
          .eq('shop_id', shop.id)
          .eq('is_active', true)
          .order('sort_order')
        console.log('dining options loaded:', opts)
        setDiningOptions(opts || [])
      }

      // Load active POS terminals
      const { data: terminals } = await supabase
        .from('pos_terminals')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('created_at')
      setPosTerminals(terminals || [])

      if (shop.feature_open_tickets) {
        const { data: tickets } = await supabase
          .from('open_tickets')
          .select('*')
          .eq('shop_id', shop.id)
          .order('created_at', { ascending: false })
        setOpenTickets(tickets || [])
      }

      // ── Inventory availability ─────────────────────────────────────────────
      // item_ingredients links a non-variant item -> ingredient + quantity needed
      // item_variant_ingredients links a variant -> ingredient + quantity needed
      // item_bom is the BOM system (no shop_id) — same shape as item_ingredients
      // inventory_levels tracks current stock per ingredient item
      const [ingredientsRes, variantIngredientsRes, inventoryRes, bomRes] = await Promise.all([
        supabase
          .from('item_ingredients')
          .select('item_id, ingredient_id, quantity, items!item_ingredients_ingredient_id_fkey(name)')
          .eq('shop_id', shop.id),
        supabase
          .from('item_variant_ingredients')
          .select('variant_id, ingredient_id, quantity, items!item_variant_ingredients_ingredient_id_fkey(name), item_variants!item_variant_ingredients_variant_id_fkey(item_id)')
          .eq('shop_id', shop.id),
        supabase
          .from('inventory_levels')
          .select('item_id, quantity')
          .eq('shop_id', shop.id),
        supabase
          .from('item_bom')
          .select('item_id, ingredient_id, quantity, items!item_bom_ingredient_id_fkey(name)'),
      ])

      const ingredients: any[] = ingredientsRes.data || []
      const variantIngredients: any[] = variantIngredientsRes.data || []
      const inventory: any[] = inventoryRes.data || []
      const bomIngredients: any[] = bomRes.data || []

      // Build a lookup: ingredient item_id -> current stock quantity
      const stockMap = new Map<string, number>()
      for (const inv of inventory) {
        stockMap.set(inv.item_id, Number(inv.quantity ?? 0))
      }

      // Merge item_bom rows into item_ingredients — BOM takes precedence if both
      // exist for the same item (item_ingredients entry is skipped for BOM items).
      const bomItemIds = new Set(bomIngredients.map((r: any) => r.item_id))
      const mergedIngredients = [
        ...ingredients.filter((r: any) => !bomItemIds.has(r.item_id)),
        ...bomIngredients,
      ]

      // Group non-variant ingredients by sellable item_id
      const ingredientsByItem = new Map<string, any[]>()
      for (const ing of mergedIngredients) {
        if (!ingredientsByItem.has(ing.item_id)) ingredientsByItem.set(ing.item_id, [])
        ingredientsByItem.get(ing.item_id)!.push(ing)
      }

      // Group variant ingredients by variant_id
      const variantIngByVariant = new Map<string, any[]>()
      for (const ing of variantIngredients) {
        if (!variantIngByVariant.has(ing.variant_id)) variantIngByVariant.set(ing.variant_id, [])
        variantIngByVariant.get(ing.variant_id)!.push(ing)
      }

      // For each parent item, compute the best canMake across all its variants
      // (the item is available if at least one variant can be made)
      const variantAvailByItem = new Map<string, number>()
      const variantCanMakeById = new Map<string, number | null>()
      for (const [variantId, ings] of variantIngByVariant.entries()) {
        const itemId = ings[0]?.item_variants?.item_id
        const canMake = Math.min(
          ...ings.map((ing: any) => {
            const have = stockMap.get(ing.ingredient_id) ?? 0
            const need = Number(ing.quantity)
            return need > 0 ? Math.floor(have / need) : Infinity
          })
        )
        variantCanMakeById.set(variantId, canMake === Infinity ? null : canMake)

        if (!itemId) continue
        // Best variant wins: item is available if any variant is makeable
        const prev = variantAvailByItem.get(itemId) ?? 0
        variantAvailByItem.set(itemId, Math.max(prev, canMake))
      }
      setVariantAvailabilityMap(variantCanMakeById)

      // Compute availability for each sellable item
      const newAvailMap: AvailabilityMap = new Map()

      // Non-variant items (keyed directly by item_id in item_ingredients)
      for (const [itemId, ings] of ingredientsByItem.entries()) {
        const shortages: AvailabilityInfo['shortages'] = []
        let canMake = Infinity

        for (const ing of ings) {
          const have = stockMap.get(ing.ingredient_id) ?? 0
          const need = Number(ing.quantity)
          const possible = need > 0 ? Math.floor(have / need) : Infinity
          canMake = Math.min(canMake, possible)
          if (have < need) {
            shortages.push({
              ingredient: (ing.items as any)?.name ?? ing.ingredient_id,
              have: Math.round(have * 100) / 100,
              need: Math.round(need * 100) / 100,
              unit: '',
            })
          }
        }

        newAvailMap.set(itemId, {
          canMake: canMake === Infinity ? null : canMake,
          shortages,
        })
      }

      // Variant items (resolved via item_variant_ingredients → item_variants.item_id)
      for (const [itemId, canMake] of variantAvailByItem.entries()) {
        if (newAvailMap.has(itemId)) continue // non-variant recipe takes precedence
        newAvailMap.set(itemId, {
          canMake: canMake === Infinity ? null : canMake,
          shortages: canMake === 0
            ? [{ ingredient: 'variant ingredients', have: 0, need: 1, unit: '' }]
            : [],
        })
      }

      setAvailabilityMap(newAvailMap)
    }
    load()
  }, [])

  // ── Shift Handlers ─────────────────────────────────────────────────────────
  // Called after terminal is selected and opening cash is entered
  async function handleClockIn(openingCash: number) {
    if (!currentUser) { toast.error('User not loaded'); return }
    const { data, error } = await supabase.from('shifts').insert({
      shop_id: shopId,
      app_user_id: currentUser.id,
      employee_id: null,
      opening_cash: openingCash,
      status: 'open',
      clock_in: new Date().toISOString(),
      pos_terminal_id: selectedTerminal?.id ?? null,
    }).select().single()
    if (error) { toast.error('Failed to open shift'); return }
    setActiveShift(data)
    localStorage.setItem('pos_active_shift', JSON.stringify(data))
    setShiftModal(null)
    setShowTerminalPicker(false)
    toast.success(`Shift opened${selectedTerminal ? ` on ${selectedTerminal.name}` : ''}`)
  }

  async function handleClockOut(shiftId: string, closingCash: number, note: string) {
    if (!shiftId) { toast.error('No active shift found'); return }
    const { error } = await supabase.from('shifts').update({
      closing_cash: closingCash,
      status: 'closed',
      clock_out: new Date().toISOString(),
      note,
    }).eq('id', shiftId)
    if (error) { toast.error('Failed to close shift'); return }
    setActiveShift(null)
    localStorage.removeItem('pos_active_shift')
    setShiftModal(null)
    setSelectedDiningOption(null)
    setSelectedCategory(null)
    toast.success('Shift closed')  }

  async function handleCashIn(shiftId: string, amount: number, note: string) {
    if (!shiftId) { toast.error('No active shift'); return }
    await supabase.from('shift_cash_movements').insert({
      shift_id: shiftId,
      shop_id: shopId,
      type: 'cash_in',
      amount,
      note,
    })
    setShiftModal(null)
    toast.success(`Cash In: ${currencySymbol}${amount.toFixed(2)} recorded`)
  }

  async function handleCashOut(shiftId: string, amount: number, note: string, category: string) {
    if (!shiftId) { toast.error('No active shift'); return }

    // 1. Record the cash movement and capture its ID
    const { data: movement, error: movErr } = await supabase
      .from('shift_cash_movements')
      .insert({
        shift_id: shiftId,
        shop_id: shopId,
        type: 'cash_out',
        amount,
        note,
      })
      .select()
      .single()

    if (movErr) { toast.error('Failed to record cash out'); return }

    // 2. Also log it as a journal expense entry so Finance picks it up
    try {
      const entryDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: shopTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())

      await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          category,
          amount,
          description: note || null,
          reference_no: null,
          date: entryDate,
          is_recurring: false,
          recurring_day: null,
          reference_type: 'cash_movement',
          reference_id: movement.id,
        }),
      })
    } catch (err) {
      // Journal write failure shouldn't block the POS flow — log but don't throw
      console.error('[handleCashOut] Journal entry failed:', err)
    }

    setShiftModal(null)
    toast.success(`Cash Out: ${currencySymbol}${amount.toFixed(2)} recorded`)
  }

  // ── New Transaction ────────────────────────────────────────────────────────
  function handleNewTransaction() {
    console.log('featureDiningOptions:', featureDiningOptions)
    console.log('diningOptions:', diningOptions)
    console.log('featureShifts:', featureShifts)
    console.log('activeShift:', activeShift)
    clearCart()
    setSelectedCategory(null)
    if (featureDiningOptions && diningOptions.length > 0) {
      setSelectedDiningOption(null)
      setShowDiningModal(true)
    } else {
      setSelectedDiningOption(null)
    }
  }

  function handleDiningSelect(opt: any) {
    setSelectedDiningOption(opt)
    setShowDiningModal(false)
    clearCart()
  }

  function handleDiningSkip() {
    setSelectedDiningOption(null)
    setShowDiningModal(false)
    clearCart()
  }

  // ── Open Tickets ───────────────────────────────────────────────────────────
  async function handleSaveTicket(name: string) {
    if (cartItems.length === 0) { toast.error('Cart is empty'); return }
    const total = cartItems.reduce((sum: number, i: any) => sum + i.lineTotal, 0)
    const { data, error } = await supabase.from('open_tickets').insert({
      shop_id: shopId,
      name: name.trim() || null,
      cart_items: cartItems,
      dining_option_id: selectedDiningOption?.id || null,
      dining_option_name: selectedDiningOption?.name || null,
      total,
      item_count: cartItems.length,
    }).select().single()
    if (error) { toast.error('Failed to save ticket'); return }
    setOpenTickets(prev => [data, ...prev])
    clearCart()
    setSelectedDiningOption(null)
    setSelectedCategory(null)
    setShowSaveModal(false)
    toast.success('Ticket saved')
  }

  async function handleLoadTicket(ticket: any) {
    loadItems(ticket.cart_items || [])
    if (ticket.dining_option_id) {
      setSelectedDiningOption({ id: ticket.dining_option_id, name: ticket.dining_option_name })
    }
    await supabase.from('open_tickets').delete().eq('id', ticket.id)
    setOpenTickets(prev => prev.filter(t => t.id !== ticket.id))
    setShowTicketsModal(false)
    toast.success(`Loaded: ${ticket.name || 'ticket'}`)
  }

  async function handleDeleteTicket(id: string) {
    await supabase.from('open_tickets').delete().eq('id', id)
    setOpenTickets(prev => prev.filter(t => t.id !== id))
    toast.success('Ticket deleted')
  }

  // ── Item tap ───────────────────────────────────────────────────────────────
  async function openItemPicker(item: any) {
    setPickerLoading(true)
    setPickerItem(item)
    setPickerVariants([])
    setPickerAddonCategories([])

    const [variantRes, addonCatRes] = await Promise.all([
      item.has_variants
        ? supabase.from('item_variants').select('id, name, price, cost').eq('item_id', item.id).eq('is_active', true).order('sort_order')
        : Promise.resolve({ data: [] }),
      item.offer_addons
        ? supabase.from('item_addon_categories').select('category_id, categories(id, name)').eq('item_id', item.id)
        : Promise.resolve({ data: [] }),
    ])

    setPickerVariants((variantRes as any).data || [])

    // Fetch addon items grouped by category
    const catRows: { category_id: string; categories: { id: string; name: string } }[] = (addonCatRes as any).data || []
    if (catRows.length > 0) {
      const catIds = catRows.map(r => r.category_id)
      const { data: addonItemsData } = await supabase
        .from('items')
        .select('id, name, price, category_id')
        .in('category_id', catIds)
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('name')

      const itemsByCat = new Map<string, AddonItem[]>()
      for (const a of addonItemsData || []) {
        if (!itemsByCat.has(a.category_id)) itemsByCat.set(a.category_id, [])
        const addonAvail = availabilityMap.get(a.id)
        itemsByCat.get(a.category_id)!.push({
          id: a.id,
          name: a.name,
          price: Number(a.price),
          selected: false,
          quantity: 1,
          outOfStock: addonAvail ? addonAvail.canMake === 0 : false,
          canMake: addonAvail ? addonAvail.canMake : null,
        })
      }

      const grouped: AddonCategory[] = catRows
        .map(r => ({
          id: r.category_id,
          name: r.categories?.name ?? r.category_id,
          items: itemsByCat.get(r.category_id) || [],
        }))
        .filter(cat => cat.items.length > 0)

      setPickerAddonCategories(grouped)
    }

    setPickerLoading(false)
  }

  async function handleItemTap(item: any) {
    const avail = availabilityMap.get(item.id)
    // Hard block — cannot proceed if any ingredient is insufficient
    if (avail && avail.shortages.length > 0) {
      const names = avail.shortages.map(s => s.ingredient).join(', ')
      toast.error(`Cannot add "${item.name}" — insufficient ingredients: ${names}`, {
        duration: 4000,
      })
      return
    }
    await openItemPicker(item)
  }

  function handlePickerConfirm(variant: Variant | null, note: string, addons: AddonItem[]) {
    if (!pickerItem) return
    const basePrice = variant ? Number(variant.price) : Number(pickerItem.price)
    const baseName = variant ? `${pickerItem.name} (${variant.name})` : pickerItem.name
    const addonLines = addons.map(a => ({ id: a.id, name: a.name, price: a.price, quantity: a.quantity }))

    if (editingCartItemId) {
      // Edit mode: update existing cart item in place
      updateItem(editingCartItemId, {
        name: baseName,
        price: basePrice,
        variantId: variant?.id,
        addons: addonLines,
        note: note.trim() || undefined,
      })
      toast.success(`${baseName} updated`)
      setEditingCartItemId(null)
    } else {
      // Add mode: new cart item
      addItem({
        itemId: pickerItem.id,
        name: baseName,
        price: basePrice,
        quantity: 1,
        modifiers: [],
        addons: addonLines,
        trackStock: pickerItem.track_stock,
        note: note.trim() || undefined,
        variantId: variant?.id,
      })
      const addonCount = addons.length
      toast.success(`${baseName} added${addonCount > 0 ? ` + ${addonCount} add-on${addonCount > 1 ? 's' : ''}` : ''}`)
    }

    setPickerItem(null)
    setPickerVariants([])
    setPickerAddonCategories([])
  }

  // Called by Cart's onEditItem — re-opens the variant/addon picker pre-filled
  async function handleEditCartItem(cartItemId: string) {
    const cartItem = cartItems.find(i => i.id === cartItemId)
    if (!cartItem) return
    const menuItem = items.find(i => i.id === cartItem.itemId)
    if (!menuItem) return
    setEditingCartItemId(cartItemId)
    await openItemPicker(menuItem)
  }

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const item of items) {
      const cid = item.category_id
      if (!cid) continue
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid)!.push(item)
    }
    return map
  }, [items])

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return categories
    return categories.filter(c => c.name.toLowerCase().includes(q))
  }, [categories, search])

  const categoryItems = useMemo(() => {
    const base = selectedCategory ? itemsByCategory.get(selectedCategory.id) || [] : []
    const q = search.toLowerCase().trim()
    if (!q) return base
    return base.filter((i: any) => i.name.toLowerCase().includes(q))
  }, [selectedCategory, itemsByCategory, search])

  const readyToOrder = (!featureShifts || !!activeShift) && (!featureDiningOptions || !!selectedDiningOption)

  // Cart summary for the FAB
  const cartSubtotal = cartItems.reduce((sum: number, i: any) => sum + i.lineTotal, 0)
  const cartItemCount = cartItems.reduce((sum: number, i: any) => sum + i.quantity, 0)

  return (
    // ── Outer shell: full screen, two-col on desktop, single-col on tablet ──
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ── Modals ── */}
      {pickerItem && !pickerLoading && (
        <VariantPickerModal
          item={pickerItem} variants={pickerVariants} addonCategories={pickerAddonCategories}
          currencySymbol={currencySymbol}
          variantAvailability={variantAvailabilityMap}
          addonAvailability={availabilityMap}
          onConfirm={handlePickerConfirm}
          onClose={() => { setPickerItem(null); setPickerVariants([]); setPickerAddonCategories([]) }}
        />
      )}
      {pickerLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl px-6 py-4 shadow-xl text-sm text-gray-500">Loading…</div>
        </div>
      )}
      {showTerminalPicker && (
        <TerminalPickerModal
          terminals={posTerminals}
          onSelect={terminal => {
            setSelectedTerminal(terminal)
            setShowTerminalPicker(false)
            setShiftModal('clockin')
          }}
          onClose={() => setShowTerminalPicker(false)}
        />
      )}
      {shiftModal && (
        <ShiftModal
          mode={shiftModal}
          currentUser={currentUser}
          currencySymbol={currencySymbol}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          onCashIn={handleCashIn}
          onCashOut={handleCashOut}
          onClose={() => setShiftModal(null)}
        />
      )}
      {showDiningModal && (
        <DiningOptionModal options={diningOptions} onSelect={handleDiningSelect} onSkip={handleDiningSkip} />
      )}
      {showTicketsModal && (
        <OpenTicketsModal
          tickets={openTickets}
          currencySymbol={currencySymbol}
          shopTimezone={shopTimezone}
          onLoad={handleLoadTicket}
          onDelete={handleDeleteTicket}
          onClose={() => setShowTicketsModal(false)}
        />
      )}
      {showSaveModal && (
        <SaveTicketModal onSave={handleSaveTicket} onClose={() => setShowSaveModal(false)} />
      )}

      {/* ── Left / main panel (full width on tablet, flex-1 on desktop) ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 flex-wrap">
          {selectedCategory ? (
            <button onClick={() => { setSelectedCategory(null); setSearch('') }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <ArrowLeft className="w-7 h-7" />
            </button>
          ) : (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 p-1">
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <Link href="/dashboard" className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors">
                <LayoutDashboard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </div>
          )}

          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-xs text-gray-400 hidden sm:block">{formattedDate} · {formattedTime}</span>
            <span className="text-sm font-semibold text-gray-800 truncate">
              Hi, {userName}
              {selectedCategory && <span className="text-gray-400 font-normal"> · {selectedCategory.name}</span>}
            </span>
          </div>

          <div className="flex-1" />

          {/* Shift controls */}
          {featureShifts && (
            <div className="flex items-center gap-1">
              {!activeShift ? (
                <>
                  <button onClick={() => {
                    if (posTerminals.length > 0) {
                      setShowTerminalPicker(true)
                    } else {
                      setShiftModal('clockin')
                    }
                  }} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 transition-colors">
                    <LogIn className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Open Shift</span>
                  </button>
                  {currentUser?.role === 'cashier' && (
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut()
                        router.push('/login')
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Out</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => setShiftModal('cashin')} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors">
                    <ArrowDownCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Cash In</span>
                  </button>
                  <button onClick={() => setShiftModal('cashout')} className="flex items-center gap-1 px-2 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl text-xs font-semibold hover:bg-orange-100 transition-colors">
                    <ArrowUpCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Cash Out</span>
                  </button>
                  <button onClick={() => setShiftModal('clockout')} className="flex items-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Close Shift</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Active terminal badge */}
          {featureShifts && activeShift && selectedTerminal && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl">
              <Monitor className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700 hidden sm:inline">{selectedTerminal.name}</span>
            </div>
          )}

          {/* Sales Report */}
          {featureShifts && activeShift && (
            <button onClick={() => router.push(`/pos/shift-report?shiftId=${activeShift.id}`)} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
              <TrendingUp className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Report</span>
            </button>
          )}

          {/* Open Tickets */}
          {featureOpenTickets && readyToOrder && (
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSaveModal(true)} title="Save current cart as ticket" className="flex items-center gap-1 px-2 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl text-xs font-semibold hover:bg-purple-100 transition-colors">
                <Save className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Save</span>
              </button>
              <button onClick={() => setShowTicketsModal(true)} className="flex items-center gap-1 px-2 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl text-xs font-semibold hover:bg-purple-100 transition-colors relative">
                <Ticket className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Tickets</span>
                {openTickets.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">{openTickets.length}</span>
                )}
              </button>
            </div>
          )}

          {/* Dining option indicator */}
          {featureDiningOptions && selectedDiningOption && (
            <button onClick={() => setShowDiningModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-xs font-semibold hover:bg-teal-100 transition-colors">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedDiningOption.name}</span>
            </button>
          )}

          {/* Search */}
          {readyToOrder && (
            <div className="relative w-32 sm:w-44 lg:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder={selectedCategory ? 'Search items...' : 'Search...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
            </div>
          )}

          {/* View toggle */}
          {readyToOrder && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
              <button onClick={() => setViewMode('grid')} className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Item grid — full width, padded bottom on tablet to clear the FAB */}
        <div className="flex-1 overflow-y-auto p-3 pb-24 lg:pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>

          ) : featureShifts && !activeShift ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <LogIn className="w-12 h-12 opacity-40" />
              <p className="text-base font-medium text-gray-500">Open a shift to start taking orders</p>
              <button onClick={() => {
                if (posTerminals.length > 0) {
                  setShowTerminalPicker(true)
                } else {
                  setShiftModal('clockin')
                }
              }} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Open Shift
              </button>
            </div>

          ) : featureDiningOptions && !selectedDiningOption ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <UtensilsCrossed className="w-12 h-12 opacity-40" />
              <p className="text-base font-medium text-gray-500">Start a new transaction to begin</p>
              <button onClick={handleNewTransaction} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Transaction
              </button>
            </div>

          ) : !selectedCategory ? (
            filteredCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Tag className="w-10 h-10" />
                <p>{search ? 'No categories match your search' : 'No categories found'}</p>
                {!search && <Link href="/categories" className="text-indigo-600 text-sm hover:underline">Add categories in back office</Link>}
              </div>
            ) : viewMode === 'grid' ? (
              // ── Category grid: 2 cols on tablet, 3 on desktop ──
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredCategories.map(cat => {
                  const count = itemsByCategory.get(cat.id)?.length ?? 0
                  return (
                    <button key={cat.id} onClick={() => { setSelectedCategory(cat); setSearch('') }}
                      className="bg-white rounded-2xl border border-gray-200 p-4 text-left hover:shadow-md active:scale-95 transition-all group">
                      <div className="w-9 h-9 rounded-xl mb-2.5 flex items-center justify-center" style={{ backgroundColor: `${cat.color}20` }}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">{cat.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{count} item{count !== 1 ? 's' : ''}</p>
                      <div className="w-full h-1 rounded-full mt-2.5 opacity-60" style={{ backgroundColor: cat.color || '#6366f1' }} />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCategories.map(cat => {
                  const count = itemsByCategory.get(cat.id)?.length ?? 0
                  return (
                    <button key={cat.id} onClick={() => { setSelectedCategory(cat); setSearch('') }}
                      className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 hover:shadow-sm active:scale-[0.99] transition-all group text-left">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cat.color}20` }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">{cat.name}</p>
                        <p className="text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="w-16 h-1 rounded-full opacity-60" style={{ backgroundColor: cat.color || '#6366f1' }} />
                    </button>
                  )
                })}
              </div>
            )

          ) : (
            categoryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Tag className="w-10 h-10" />
                <p>{search ? 'No items match your search' : 'No items in this category'}</p>
                {!search && <Link href="/items" className="text-indigo-600 text-sm hover:underline">Add items in back office</Link>}
              </div>
            ) : viewMode === 'grid' ? (
              // ── Item grid: 2 cols on tablet, 3 on desktop ──
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {categoryItems.map((item: any) => {
                  const avail = availabilityMap.get(item.id)
                  const outOfStock = avail?.canMake === 0
                  const lowStock = avail && avail.canMake !== null && avail.canMake > 0 && avail.canMake <= 3
                  const hasIngredients = !!avail
                  return (
                    <button key={item.id} onClick={() => handleItemTap(item)}
                      disabled={outOfStock}
                      className={`bg-white rounded-xl border p-3 text-left transition-all relative ${
                        outOfStock
                          ? 'border-red-200 opacity-50 cursor-not-allowed'
                          : lowStock
                          ? 'border-amber-200 hover:border-amber-300 hover:shadow-sm active:scale-95'
                          : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm active:scale-95'
                      }`}>
                      <div className="w-full h-1 rounded-full mb-2" style={{ backgroundColor: selectedCategory.color || '#e5e7eb' }} />
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      {item.has_variants ? (
                        <p className="text-xs text-indigo-400 mt-1 font-medium">Multiple variants</p>
                      ) : (
                        <p className="text-sm font-semibold text-indigo-600 mt-1">{currencySymbol}{Number(item.price).toFixed(2)}</p>
                      )}
                      {item.offer_addons && (
                        <p className="text-xs text-emerald-500 mt-0.5 font-medium">
                          + {addonCatCounts.get(item.id) ?? 0} Add-on {(addonCatCounts.get(item.id) ?? 0) === 1 ? 'category' : 'categories'}
                        </p>
                      )}
                      {/* Availability badge */}
                      {hasIngredients && (
                        <div className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          outOfStock
                            ? 'bg-red-100 text-red-600'
                            : lowStock
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${outOfStock ? 'bg-red-500' : lowStock ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          {outOfStock
                            ? 'Out of stock'
                            : avail.canMake === null
                            ? 'In stock'
                            : `${avail.canMake} available`}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {categoryItems.map((item: any) => {
                  const avail = availabilityMap.get(item.id)
                  const outOfStock = avail?.canMake === 0
                  const lowStock = avail && avail.canMake !== null && avail.canMake > 0 && avail.canMake <= 3
                  const hasIngredients = !!avail
                  return (
                    <button key={item.id} onClick={() => handleItemTap(item)}
                      disabled={outOfStock}
                      className={`w-full bg-white rounded-xl border px-4 py-3 flex items-center gap-4 transition-all text-left ${
                        outOfStock
                          ? 'border-red-200 opacity-50 cursor-not-allowed'
                          : lowStock
                          ? 'border-amber-200 hover:border-amber-300 hover:shadow-sm active:scale-[0.99]'
                          : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm active:scale-[0.99]'
                      }`}>
                      <div className="w-2 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: selectedCategory.color || '#6366f1' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        {item.offer_addons && (
                          <p className="text-xs text-emerald-500 font-medium">
                            + {addonCatCounts.get(item.id) ?? 0} Add-on {(addonCatCounts.get(item.id) ?? 0) === 1 ? 'category' : 'categories'}
                          </p>
                        )}
                        {hasIngredients && (
                          <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            outOfStock
                              ? 'bg-red-100 text-red-600'
                              : lowStock
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${outOfStock ? 'bg-red-500' : lowStock ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {outOfStock
                              ? 'Out of stock'
                              : avail.canMake === null
                              ? 'In stock'
                              : `${avail.canMake} available`}
                          </div>
                        )}
                      </div>
                      {item.has_variants ? (
                        <p className="text-xs text-indigo-400 font-medium flex-shrink-0">Variants</p>
                      ) : (
                        <p className="text-sm font-semibold text-indigo-600 flex-shrink-0">{currencySymbol}{Number(item.price).toFixed(2)}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Desktop: side cart panel (hidden on tablet/mobile) ── */}
      <div className="hidden lg:flex w-80 xl:w-96 bg-white border-l border-gray-200 flex-col flex-shrink-0 overflow-hidden">
        <Cart
          diningOption={selectedDiningOption}
          activeShiftId={activeShift?.id || null}
          cashierName={userName}
          onEditItem={handleEditCartItem}
          onPaymentComplete={() => {
            handleNewTransaction()
            window.location.reload()
          }}
        />
      </div>

      {/* ── Tablet/Mobile: floating cart button ── */}
      <div className="lg:hidden fixed bottom-5 right-5 z-20">
        <button
          onClick={() => setCartSheetOpen(true)}
          className="relative flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl shadow-lg px-4 py-3 transition-all"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartItemCount > 0 && (
            <>
              <span className="text-sm font-semibold">{currencySymbol}{cartSubtotal.toFixed(2)}</span>
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {cartItemCount}
              </span>
            </>
          )}
          {cartItemCount === 0 && (
            <span className="text-sm font-medium opacity-80">Cart</span>
          )}
        </button>
      </div>

      {/* ── Cart bottom sheet (tablet/mobile) ── */}
      <CartBottomSheet
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        cartItemCount={cartItemCount}
        cartTotal={cartSubtotal}
        currencySymbol={currencySymbol}
        diningOption={selectedDiningOption}
        activeShiftId={activeShift?.id || null}
        cashierName={userName}
        onEditItem={handleEditCartItem}
        onPaymentComplete={() => {
          setCartSheetOpen(false)
          handleNewTransaction()
          window.location.reload()
        }}
      />
    </div>
  )
}
