'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Download, Search, ChevronDown, ChevronUp, Receipt,
  X, Printer, Ban, Edit2, RefreshCw, ShieldCheck,
  ArrowDownCircle, ArrowUpCircle, DollarSign, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

// ── Tiny pie chart ─────────────────────────────────────────────────────────────
function PieChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">No data</div>
  let cumAngle = -Math.PI / 2
  const cx = 80, cy = 80, r = 70
  const slices = segments.map(seg => {
    const angle = (seg.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle)
    const y2 = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return { ...seg, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` }
  })
  return (
    <svg viewBox="0 0 160 160" className="w-28 h-28">
      {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />)}
    </svg>
  )
}

// ── Manager PIN Modal ──────────────────────────────────────────────────────────
function ManagerPinModal({ onApprove, onClose }: { onApprove: (id: string, name: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleVerify() {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
    setLoading(true); setError('')
    const { data, error: dbErr } = await supabase
      .from('employees')
      .select('id, name, role, app_users(id, name, role)')
      .eq('pin', pin)
      .eq('is_active', true)
      .in('role', ['manager', 'owner'])
      .maybeSingle()
    setLoading(false)
    if (dbErr || !data) { setError('Invalid PIN or insufficient permissions'); setPin(''); return }
    const approverName = (data.app_users as any)?.name || data.name
    const appUserId = (data.app_users as any)?.id || data.id
    onApprove(appUserId, approverName)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Manager Approval</h3>
            <p className="text-xs text-gray-400">Enter manager PIN to continue</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <input type="password" inputMode="numeric" maxLength={8} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="••••" autoFocus
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
        />
        {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
            <button key={i} onClick={() => {
              if (k === '⌫') setPin(p => p.slice(0, -1))
              else if (k !== '') setPin(p => p.length < 8 ? p + k : p)
            }} className={`h-12 rounded-xl text-sm font-semibold transition-colors ${k === '' ? '' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleVerify} disabled={loading || pin.length < 4}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 transition-all">
            {loading ? 'Checking…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item Stock Action Modal (for removed items) ───────────────────────────────
function ItemStockModal({ itemName, onConfirm, onClose }: {
  itemName: string
  onConfirm: (type: 'return_stock' | 'wastage') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <ArrowDownCircle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Remove Item</h3>
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4 mt-1">How should the stock be handled for this removed item?</p>
        <div className="space-y-3">
          <button onClick={() => onConfirm('return_stock')}
            className="w-full text-left p-4 rounded-xl border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200">
                <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Return to Stock</p>
                <p className="text-xs text-gray-500">Item not yet dispatched — restock inventory.</p>
              </div>
            </div>
          </button>
          <button onClick={() => onConfirm('wastage')}
            className="w-full text-left p-4 rounded-xl border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200">
                <ArrowUpCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Mark as Wastage</p>
                <p className="text-xs text-gray-500">Already dispatched — log as wastage, no restock.</p>
              </div>
            </div>
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Ingredient Confirm Modal (for added items) ────────────────────────────────
function IngredientConfirmModal({ itemName, onConfirm, onClose }: {
  itemName: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Edit2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add Item</h3>
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Adding this item will <span className="font-semibold text-blue-700">deduct ingredients</span> from inventory. Continue?
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all">
            Confirm & Deduct
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Transaction Modal ─────────────────────────────────────────────────────
function EditTransactionModal({ receipt, receiptItemsMap, currencySymbol, managerId, managerName, onClose, onSaved }: {
  receipt: any
  receiptItemsMap: Record<string, any[]>
  currencySymbol: string
  managerId: string
  managerName: string
  onClose: () => void
  onSaved: () => void
}) {
  type EditItem = {
    id: string
    item_name: string
    quantity: number
    unit_price: number
    line_total: number
    addons: any[]
    note: string
    _isNew?: boolean
    _deleted?: boolean
    _stockAction?: 'return_stock' | 'wastage'
    _item_id?: string | null
    _variant_id?: string | null
  }

  const initialItems: EditItem[] = (receiptItemsMap[receipt.id] || []).map((it: any) => ({
    id: it.id,
    item_name: it.item_name,
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    line_total: Number(it.line_total),
    addons: it.addons || [],
    note: it.note || '',
  }))

  const [items, setItems] = useState<EditItem[]>(initialItems)
  const [note, setNote] = useState(receipt.note || '')
  const [saving, setSaving] = useState(false)

  // New item form
  const [showNewItem, setShowNewItem] = useState(false)
  const [newQty, setNewQty] = useState(1)

  // Menu search panel state
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [menuCategories, setMenuCategories] = useState<any[]>([])
  const [menuSearch, setMenuSearch] = useState('')
  const [menuCategory, setMenuCategory] = useState<string | 'all'>('all')
  const [menuLoading, setMenuLoading] = useState(false)
  const [selectedMenuItem, setSelectedMenuItem] = useState<any | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null)

  // Sub-modals
  const [stockModalItem, setStockModalItem] = useState<EditItem | null>(null)
  const [ingredientConfirmItem, setIngredientConfirmItem] = useState<EditItem | null>(null)

  const visibleItems = items.filter(it => !it._deleted)
  const computedTotal = visibleItems.reduce((s, it) => s + it.line_total, 0)

  function updateItem(id: string, patch: Partial<EditItem>) {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const updated = { ...it, ...patch }
      updated.line_total = updated.quantity * updated.unit_price
      return updated
    }))
  }

  function requestRemove(item: EditItem) {
    if (item._isNew) {
      // New items added this session can just be removed without stock prompting
      setItems(prev => prev.filter(it => it.id !== item.id))
    } else {
      setStockModalItem(item)
    }
  }

  function confirmRemove(stockAction: 'return_stock' | 'wastage') {
    if (!stockModalItem) return
    setItems(prev => prev.map(it =>
      it.id === stockModalItem.id ? { ...it, _deleted: true, _stockAction: stockAction } : it
    ))
    setStockModalItem(null)
  }

  // Fetch menu items when the panel opens
  useEffect(() => {
    if (!showNewItem) return
    setMenuLoading(true)
    Promise.all([
      supabase
        .from('items')
        .select('id, name, price, is_active, available_for_sale, category_id, item_variants(id, name, price)')
        .eq('is_active', true)
        .eq('available_for_sale', true)
        .order('name'),
      supabase
        .from('categories')
        .select('id, name')
        
        .order('sort_order'),
    ]).then(([itemsRes, catsRes]) => {
      setMenuItems(itemsRes.data || [])
      setMenuCategories(catsRes.data || [])
      setMenuLoading(false)
    })
  }, [showNewItem])

  function requestAddMenuItem() {
    if (!selectedMenuItem) return
    const hasVariants = (selectedMenuItem.item_variants?.length ?? 0) > 0
    if (hasVariants && !selectedVariant) return
    const price = Number(selectedVariant?.price ?? selectedMenuItem.price)
    const candidate: EditItem = {
      id: `new_${Date.now()}`,
      item_name: selectedVariant
        ? `${selectedMenuItem.name} (${selectedVariant.name})`
        : selectedMenuItem.name,
      quantity: newQty,
      unit_price: price,
      line_total: newQty * price,
      addons: [],
      note: '',
      _isNew: true,
      _item_id: selectedMenuItem.id,
      _variant_id: selectedVariant?.id ?? null,
    }
    setIngredientConfirmItem(candidate)
  }

  function requestAddItem() {
    // Legacy — unused now, kept to avoid TS errors if referenced elsewhere
  }

  function confirmAddItem() {
    if (!ingredientConfirmItem) return
    setItems(prev => [...prev, ingredientConfirmItem])
    setIngredientConfirmItem(null)
    // Reset panel
    setSelectedMenuItem(null)
    setSelectedVariant(null)
    setMenuSearch('')
    setMenuCategory('all')
    setNewQty(1)
    setShowNewItem(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const deletedItems = items.filter(it => it._deleted && !it._isNew)
      const newItems     = items.filter(it => it._isNew && !it._deleted)
      const changedItems = items.filter(it => !it._isNew && !it._deleted).filter(it => {
        const orig = initialItems.find(o => o.id === it.id)
        return orig && (orig.quantity !== it.quantity || orig.unit_price !== it.unit_price || orig.note !== it.note)
      })

      const res = await fetch(`/api/transactions/${receipt.id}/edit-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deleted_items: deletedItems.map(it => ({
            id: it.id,
            item_name: it.item_name,
            stockAction: it._stockAction ?? 'return_stock',
          })),
          added_items: newItems.map(it => ({
            item_name:  it.item_name,
            quantity:   it.quantity,
            unit_price: it.unit_price,
            line_total: it.line_total,
            addons:     it.addons,
            note:       it.note,
            item_id:    it._item_id ?? null,
            variant_id: it._variant_id ?? null,
          })),
          changed_items: changedItems.map(it => {
            const orig = initialItems.find(o => o.id === it.id)!
            return {
              id:            it.id,
              item_name:     it.item_name,
              quantity:      it.quantity,
              unit_price:    it.unit_price,
              line_total:    it.line_total,
              note:          it.note,
              prev_quantity: orig.quantity,
            }
          }),
          new_total:   computedTotal,
          note,
          edited_by:   managerId,
          editor_name: managerName,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save changes')
        return
      }

      toast.success('Transaction updated')
      onSaved(); onClose()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {stockModalItem && (
        <ItemStockModal
          itemName={stockModalItem.item_name}
          onConfirm={confirmRemove}
          onClose={() => setStockModalItem(null)}
        />
      )}
      {ingredientConfirmItem && (
        <IngredientConfirmModal
          itemName={ingredientConfirmItem.item_name}
          onConfirm={confirmAddItem}
          onClose={() => setIngredientConfirmItem(null)}
        />
      )}

      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <Edit2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Edit Transaction</h3>
              <p className="text-xs text-gray-400">#{receipt.receipt_number || receipt._ref} · Approved by {managerName}</p>
            </div>
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Line Items</p>
                <button onClick={() => setShowNewItem(v => !v)}
                  className="text-xs text-blue-600 hover:underline font-medium">
                  {showNewItem ? 'Cancel' : '+ Add item'}
                </button>
              </div>

              {/* Menu search panel */}
              {showNewItem && (
                <div className="mb-3 rounded-xl border-2 border-blue-200 bg-blue-50 overflow-hidden">
                  {/* Search + category bar */}
                  <div className="p-3 border-b border-blue-100 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        autoFocus
                        value={menuSearch}
                        onChange={e => { setMenuSearch(e.target.value); setSelectedMenuItem(null); setSelectedVariant(null) }}
                        placeholder="Search menu items..."
                        className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      />
                    </div>
                    {menuCategories.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        <button
                          onClick={() => setMenuCategory('all')}
                          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${menuCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-100'}`}>
                          All
                        </button>
                        {menuCategories.map((cat: any) => (
                          <button key={cat.id}
                            onClick={() => setMenuCategory(cat.id)}
                            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${menuCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-100'}`}>
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Item list */}
                  <div className="max-h-48 overflow-y-auto">
                    {menuLoading ? (
                      <p className="text-xs text-gray-400 text-center py-6">Loading menu...</p>
                    ) : (() => {
                      const filtered = menuItems.filter((mi: any) => {
                        const matchSearch = !menuSearch || mi.name.toLowerCase().includes(menuSearch.toLowerCase())
                        const matchCat = menuCategory === 'all' || mi.category_id === menuCategory
                        return matchSearch && matchCat
                      })
                      if (filtered.length === 0) return (
                        <p className="text-xs text-gray-400 text-center py-6">No items found</p>
                      )
                      return (
                        <div className="divide-y divide-blue-100">
                          {filtered.map((mi: any) => {
                            const isSelected = selectedMenuItem?.id === mi.id
                            const hasVariants = mi.item_variants?.length > 0
                            return (
                              <div key={mi.id}>
                                <button
                                  onClick={() => { setSelectedMenuItem(isSelected ? null : mi); setSelectedVariant(null) }}
                                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                                  <div>
                                    <p className="text-xs font-semibold text-gray-800">{mi.name}</p>
                                    <p className="text-[10px] text-gray-400">{menuCategories.find(c => c.id === mi.category_id)?.name}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-3">
                                    {!hasVariants && (
                                      <p className="text-xs font-bold text-gray-900">{currencySymbol}{Number(mi.price).toFixed(2)}</p>
                                    )}
                                    {hasVariants && (
                                      <p className="text-[10px] text-blue-500 font-medium">{mi.item_variants.length} variants</p>
                                    )}
                                  </div>
                                </button>
                                {/* Variant picker */}
                                {isSelected && hasVariants && (
                                  <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                                    {mi.item_variants.map((v: any) => (
                                      <button key={v.id}
                                        onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                          selectedVariant?.id === v.id
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                                        }`}>
                                        {v.name} — {currencySymbol}{Number(v.price).toFixed(2)}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Qty + Add row — shown once item (and variant if needed) is selected */}
                  {selectedMenuItem && (!((selectedMenuItem?.item_variants?.length ?? 0) > 0) || selectedVariant) && (
                    <div className="px-3 py-2.5 border-t border-blue-100 bg-white flex items-center gap-2">
                      <p className="text-xs font-medium text-gray-700 flex-1 truncate">
                        {selectedVariant ? `${selectedMenuItem.name} (${selectedVariant.name})` : selectedMenuItem.name}
                        <span className="ml-1 font-bold text-blue-600">
                          {currencySymbol}{Number(selectedVariant?.price ?? selectedMenuItem.price).toFixed(2)}
                        </span>
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setNewQty(q => Math.max(1, q - 1))}
                          className="w-6 h-6 rounded bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-200">-</button>
                        <span className="w-6 text-center text-xs font-semibold">{newQty}</span>
                        <button onClick={() => setNewQty(q => q + 1)}
                          className="w-6 h-6 rounded bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-200">+</button>
                      </div>
                      <button onClick={requestAddMenuItem}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-all">
                        Add
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Existing items */}
              <div className="space-y-2">
                {visibleItems.map(item => (
                  <div key={item.id} className={`flex items-center gap-2 p-3 rounded-xl border ${item._isNew ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{item.item_name}
                        {item._isNew && <span className="ml-1 text-[10px] text-blue-600 font-semibold">NEW</span>}
                      </p>
                      {item.addons?.length > 0 && (
                        <p className="text-[10px] text-indigo-500 truncate">
                          {item.addons.map((a: any) => a.name).join(', ')}
                        </p>
                      )}
                    </div>
                    {/* Qty */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                        className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs flex items-center justify-center font-bold">−</button>
                      <span className="w-6 text-center text-xs font-semibold text-gray-800">{item.quantity}</span>
                      <button onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                        className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs flex items-center justify-center font-bold">+</button>
                    </div>
                    {/* Unit price */}
                    <input type="number" min={0} step="0.01" value={item.unit_price}
                      onChange={e => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    {/* Line total */}
                    <span className="w-20 text-right text-xs font-semibold text-gray-900 tabular-nums">
                      {currencySymbol}{item.line_total.toFixed(2)}
                    </span>
                    {/* Delete */}
                    <button onClick={() => requestRemove(item)}
                      className="p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Computed total */}
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">New Total</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">{currencySymbol}{computedTotal.toFixed(2)}</span>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Note</label>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Add a note to this transaction…" />
            </div>

            {/* Audit notice */}
            {items.some(it => it._deleted || it._isNew) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-medium">
                  ⚠️ Changes will be logged in the audit trail with your manager approval.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving || visibleItems.length === 0}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Void Type Modal ────────────────────────────────────────────────────────────
function VoidTypeModal({ onConfirm, onClose }: {
  onConfirm: (type: 'return_stock' | 'wastage') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Void Transaction</h3>
            <p className="text-xs text-gray-400">How should the stock be handled?</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 mt-5">
          <button
            onClick={() => onConfirm('return_stock')}
            className="w-full text-left p-4 rounded-xl border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200">
                <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Return to Stock</p>
                <p className="text-xs text-gray-500">Item was not dispatched. Quantity goes back to inventory.</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onConfirm('wastage')}
            className="w-full text-left p-4 rounded-xl border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200">
                <ArrowUpCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Mark as Wastage</p>
                <p className="text-xs text-gray-500">Item was already dispatched. Logged as POS Wastage, no restock.</p>
              </div>
            </div>
          </button>
        </div>

        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Helper: build unique ref number per date ───────────────────────────────────
function buildRefNumber(date: Date, sequence: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const m = get('month')
  const d = get('day')
  const y = get('year')
  return `${m}${d}${y}-${String(sequence).padStart(5, '0')}`
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

// ── Type filter options ────────────────────────────────────────────────────────
type TxType = 'all' | 'sale' | 'refund' | 'cash_in' | 'cash_out'
type StatusFilter = 'all' | 'completed' | 'voided'

export default function TransactionsPage() {
  const [receipts, setReceipts]             = useState<any[]>([])
  const [cashMovements, setCashMovements]   = useState<any[]>([])
  const [receiptItems, setReceiptItems]     = useState<Record<string, any[]>>({})
  const [loading, setLoading]               = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('₱')
  const [shopTimezone, setShopTimezone]     = useState('Asia/Manila')

  // Filters
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<TxType>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [staffFilter, setStaffFilter]   = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  // Expand / actions
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [showPin, setShowPin]     = useState(false)
  const [pinAction, setPinAction] = useState<{ type: 'void' | 'edit' | 'reprint'; tx: any } | null>(null)
  const [editReceipt, setEditReceipt] = useState<{ tx: any; managerId: string; managerName: string } | null>(null)
  const [voidTypeReceipt, setVoidTypeReceipt] = useState<{ tx: any; managerId: string; managerName: string } | null>(null)

  useEffect(() => {
    // Load currency symbol scoped to the user's shop
    supabase
      .from('app_users')
      .select('shop_id')
      .eq('auth_user_id', (supabase.auth.getUser() as any)?.data?.user?.id ?? '')
      .maybeSingle()
      .then(async ({ data: appUser }) => {
        if (!appUser?.shop_id) return
        const { data: shop } = await supabase
          .from('shops')
          .select('currency_symbol')
          .eq('id', appUser.shop_id)
          .single()
        if (shop) setCurrencySymbol(shop.currency_symbol)
      })

    // Simpler: just fetch it directly (works because RLS scopes to the user's shop)
    supabase.from('shops').select('currency_symbol, timezone').maybeSingle().then(({ data }) => {
      if (data?.currency_symbol) setCurrencySymbol(data.currency_symbol)
      if (data?.timezone) setShopTimezone(data.timezone)
    })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)

    // Build timezone-aware UTC bounds using the shop's assigned timezone
    const tz = shopTimezone

    function toUtcBound(dateStr: string, endOfDay: boolean): string {
      const time = endOfDay ? 'T23:59:59' : 'T00:00:00'
      const localDate = new Date(`${dateStr}${time}`)
      // Get the UTC offset for this local moment using Intl
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      })
      const parts = formatter.formatToParts(localDate)
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
      const localIso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
      const utcMs   = localDate.getTime()
      const localMs = new Date(localIso + 'Z').getTime()
      return new Date(utcMs - (localMs - utcMs)).toISOString()
    }

    // Only apply date bounds when the user has explicitly set them
    let receiptsQuery = supabase
      .from('receipts')
      .select('*, receipt_items(*), payment_types(name), app_users:employee_id(name), shifts(id, clock_in, app_users(name))')
      .order('created_at', { ascending: false })

    let movementsQuery = supabase
      .from('shift_cash_movements')
      .select('*, shifts(id, clock_in, app_users(name))')
      .order('created_at', { ascending: false })

    if (dateFrom) {
      const fromUtc = toUtcBound(dateFrom, false)
      receiptsQuery  = (receiptsQuery  as any).gte('created_at', fromUtc)
      movementsQuery = (movementsQuery as any).gte('created_at', fromUtc)
    }
    if (dateTo) {
      const toUtc = toUtcBound(dateTo, true)
      receiptsQuery  = (receiptsQuery  as any).lte('created_at', toUtc)
      movementsQuery = (movementsQuery as any).lte('created_at', toUtc)
    }

    const [receiptsRes, movementsRes] = await Promise.all([receiptsQuery, movementsQuery])

    if (receiptsRes.error) { toast.error('Failed to load transactions'); setLoading(false); return }

    const rxs = receiptsRes.data || []
    setReceipts(rxs)
    setCashMovements(movementsRes.data || [])

    // Build receipt items map
    const byReceipt: Record<string, any[]> = {}
    for (const r of rxs) {
      byReceipt[r.id] = r.receipt_items || []
    }
    setReceiptItems(byReceipt)

    setLoading(false)
  }, [dateFrom, dateTo, shopTimezone])

  useEffect(() => { loadData() }, [loadData])

  // ── Preset date ranges ───────────────────────────────────────────────────────
  function setPreset(preset: string) {
    const now = new Date()
    // Use the shop's timezone so "today" means today on the shop floor, not UTC
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(d)
    const todayStr = fmt(now)
    if (preset === 'all') {
      setDateFrom(''); setDateTo('')
    } else if (preset === 'today') {
      setDateFrom(todayStr); setDateTo(todayStr)
    } else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      const yStr = fmt(y)
      setDateFrom(yStr); setDateTo(yStr)
    } else if (preset === 'week') {
      const w = new Date(now); w.setDate(w.getDate() - 6)
      setDateFrom(fmt(w)); setDateTo(todayStr)
    } else if (preset === 'month') {
      // First day of the current month in shop timezone
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: shopTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now)
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '01'
      const firstOfMonth = `${get('year')}-${get('month')}-01`
      setDateFrom(firstOfMonth); setDateTo(todayStr)
    }
  }

  // ── Build unified transaction list ───────────────────────────────────────────
  const sortedReceipts = [...receipts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const receiptRefMap: Record<string, string> = {}
  sortedReceipts.forEach((r, idx) => {
    receiptRefMap[r.id] = buildRefNumber(new Date(r.created_at), idx + 1, shopTimezone)
  })

  const allTransactions = [
    ...receipts.map(r => ({
      ...r,
      _type: r.status === 'voided' ? 'refund' : 'sale',
      _time: new Date(r.created_at),
      _ref: receiptRefMap[r.id] || r.receipt_number || '—',
      _staff: r.app_users?.name || r.shifts?.app_users?.name || '—',
      _shift_date: r.shifts?.clock_in ? new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(new Date(r.shifts.clock_in)) : '—',
      _payment: r.payment_types?.name || 'Cash',
      _amount: Number(r.total ?? 0),
    })),
    ...cashMovements.map(m => ({
      ...m,
      _type: m.type as 'cash_in' | 'cash_out',
      _time: new Date(m.created_at),
      _ref: '—',
      _staff: m.shifts?.app_users?.name || '—',
      _shift_date: m.shifts?.clock_in ? new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(new Date(m.shifts.clock_in)) : '—',
      _payment: m.type === 'cash_in' ? 'Cash In' : 'Cash Out',
      _amount: Number(m.amount ?? 0),
    })),
  ].sort((a, b) => b._time.getTime() - a._time.getTime())

  // ── Apply filters ────────────────────────────────────────────────────────────
  const uniqueStaff   = [...new Set(allTransactions.map(t => t._staff).filter(s => s !== '—'))]
  const uniquePayment = [...new Set(allTransactions.map(t => t._payment).filter(Boolean))]

  const filtered = allTransactions.filter(tx => {
    if (typeFilter !== 'all' && tx._type !== typeFilter) return false
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed' && tx._type !== 'sale') return false
      if (statusFilter === 'voided' && tx._type !== 'refund') return false
    }
    if (staffFilter && tx._staff !== staffFilter) return false
    if (paymentFilter && tx._payment !== paymentFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !tx._ref.toLowerCase().includes(q) &&
        !tx._staff.toLowerCase().includes(q) &&
        !(tx.receipt_number || '').toLowerCase().includes(q) &&
        !(tx.note || '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  // ── Summary stats ────────────────────────────────────────────────────────────
  const salesTotal   = filtered.filter(t => t._type === 'sale').reduce((s, t) => s + t._amount, 0)
  const refundTotal  = filtered.filter(t => t._type === 'refund').reduce((s, t) => s + t._amount, 0)
  const cashInTotal  = filtered.filter(t => t._type === 'cash_in').reduce((s, t) => s + t._amount, 0)
  const cashOutTotal = filtered.filter(t => t._type === 'cash_out').reduce((s, t) => s + t._amount, 0)
  const netCash      = salesTotal + cashInTotal - cashOutTotal

  // Payment breakdown for pie
  const paymentBreakdown = filtered
    .filter(t => t._type === 'sale')
    .reduce((acc: Record<string, number>, t) => {
      acc[t._payment] = (acc[t._payment] || 0) + t._amount
      return acc
    }, {})
  const pieSegments = Object.entries(paymentBreakdown).map(([label, value], i) => ({
    label, value, color: COLORS[i % COLORS.length],
  }))

  // ── Action handlers ──────────────────────────────────────────────────────────
  function requestAction(type: 'void' | 'edit' | 'reprint', tx: any) {
    setPinAction({ type, tx })
    setShowPin(true)
  }

  function handlePinApproved(managerId: string, managerName: string) {
    setShowPin(false)
    if (!pinAction) return
    const { type, tx } = pinAction
    if (type === 'void') {
      setVoidTypeReceipt({ tx, managerId, managerName })
    } else if (type === 'edit') setEditReceipt({ tx, managerId, managerName })
    else if (type === 'reprint') handleReprint(tx)
    setPinAction(null)
  }

  function handleVoidTypeConfirmed(voidType: 'return_stock' | 'wastage') {
    if (!voidTypeReceipt) return
    const { tx, managerId, managerName } = voidTypeReceipt
    setVoidTypeReceipt(null)
    handleVoid(tx, managerId, managerName, voidType)
  }

  async function handleVoid(receipt: any, managerId: string, managerName: string, voidType: 'return_stock' | 'wastage' = 'return_stock') {
    const res = await fetch(`/api/transactions/${receipt.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_note: `Voided by ${managerName}`,
        void_type: voidType,
      }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || "Failed to void transaction"); return }
    toast.success(`Transaction ${receipt._ref} voided`)
    loadData()
  }

  function handleReprint(receipt: any) {
    const items = receiptItems[receipt.id] || []
    const line = '--------------------------------'
    const row = (l: string, r: string) => l + ' '.repeat(Math.max(1, 32 - l.length - r.length)) + r
    const lines = [
      `*** REPRINT ***`,
      `Ref: ${receipt._ref}`,
      new Intl.DateTimeFormat('en-US', {
        timeZone: shopTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(receipt.created_at)),
      line,
      ...items.map((i: any) => row(`${i.quantity}x ${i.item_name}`, `${currencySymbol}${Number(i.line_total).toFixed(2)}`)),
      line,
      row('Total', `${currencySymbol}${Number(receipt.total).toFixed(2)}`),
      row('Payment', receipt._payment || 'Cash'),
      '',
    ]
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`<html><head><style>body{font-family:'Courier New',monospace;font-size:12px;white-space:pre;margin:16px}@media print{@page{margin:0}body{margin:8mm}}</style></head><body>${lines.join('\n').replace(/</g, '&lt;')}</body></html>`)
    win.document.close(); win.focus(); win.print()
    toast.success('Reprinting…')
  }

  // ── CSV Export ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Ref #', 'Date', 'Time', 'Type', 'Staff', 'Shift Date', 'Items / Note', 'Payment', 'Amount', 'Status'],
      ...filtered.map(tx => [
        tx._ref,
        new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(tx._time),
        new Intl.DateTimeFormat('en-US', { timeZone: shopTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(tx._time),
        tx._type,
        tx._staff,
        tx._shift_date,
        tx._type === 'sale' || tx._type === 'refund'
          ? (receiptItems[tx.id] || []).map((i: any) => `${i.quantity}x ${i.item_name}`).join('; ')
          : (tx.note || ''),
        tx._payment,
        tx._amount.toFixed(2),
        tx.status || tx._type,
      ]),
    ]
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `transactions_${dateFrom}_to_${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported transactions CSV')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* Modals */}
      {showPin && (
        <ManagerPinModal
          onApprove={handlePinApproved}
          onClose={() => { setShowPin(false); setPinAction(null) }}
        />
      )}
      {editReceipt && (
        <EditTransactionModal
          receipt={editReceipt.tx}
          receiptItemsMap={receiptItems}
          currencySymbol={currencySymbol}
          managerId={editReceipt.managerId}
          managerName={editReceipt.managerName}
          onClose={() => setEditReceipt(null)}
          onSaved={loadData}
        />
      )}

      {voidTypeReceipt && (
        <VoidTypeModal
          onConfirm={handleVoidTypeConfirmed}
          onClose={() => setVoidTypeReceipt(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">All sales, refunds, and cash movements</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1.5" />Export CSV
          </Button>
        </div>
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
            const isAllTime = !dateFrom && !dateTo
            const active = p.key === 'all' ? isAllTime : false
            return (
              <button key={p.key} onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
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
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 text-sm" />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sales', value: salesTotal, icon: Receipt, bg: 'bg-indigo-50', text: 'text-indigo-600' },
          { label: 'Net Cash', value: netCash, icon: DollarSign, bg: 'bg-green-50', text: 'text-green-600' },
          { label: 'Cash In', value: cashInTotal, icon: ArrowDownCircle, bg: 'bg-blue-50', text: 'text-blue-600' },
          { label: 'Cash Out', value: cashOutTotal, icon: ArrowUpCircle, bg: 'bg-orange-50', text: 'text-orange-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.text}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${card.text}`}>{currencySymbol}{card.value.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment breakdown */}
      {pieSegments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Payment Breakdown
          </h3>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="flex-shrink-0 self-center sm:self-start">
              <PieChart segments={pieSegments.filter(s => s.value > 0)} />
            </div>
            <div className="flex-1 space-y-2 w-full">
              {pieSegments.filter(s => s.value > 0).map((seg, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-xs text-gray-700">{seg.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-gray-900">{currencySymbol}{seg.value.toFixed(2)}</span>
                    <span className="text-xs text-gray-400 ml-1.5">
                      {((seg.value / (salesTotal || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between">
                <span className="text-xs font-semibold text-gray-700">Total Transactions</span>
                <span className="text-xs font-semibold text-gray-900">{filtered.filter(t => t._type === 'sale').length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input placeholder="Search ref #, staff, note…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-52" />
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TxType)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-600">
          <option value="all">All Types</option>
          <option value="sale">Sale</option>
          <option value="refund">Refund / Void</option>
          <option value="cash_in">Cash In</option>
          <option value="cash_out">Cash Out</option>
        </select>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-600">
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>

        {/* Staff filter */}
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-600">
          <option value="">All Staff</option>
          {uniqueStaff.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Payment filter */}
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-600">
          <option value="">All Payments</option>
          {uniquePayment.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Clear filters */}
        {(search || typeFilter !== 'all' || statusFilter !== 'all' || staffFilter || paymentFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setStaffFilter(''); setPaymentFilter('') }}
            className="text-xs text-indigo-600 hover:underline px-2">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">All Transactions</h3>
          <span className="text-xs text-gray-400">{filtered.length} entries</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No transactions found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting the date range or filters</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Time</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Ref #</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Type</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Staff</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Shift Date</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Items / Note</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Payment</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-right px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Amount</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-center px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Status</th>
                  <th className="sticky top-0 bg-gray-50 z-10 text-center px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Actions</th>
                  <th className="sticky top-0 bg-gray-50 z-10 w-6" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const isSale    = tx._type === 'sale'
                  const isRefund  = tx._type === 'refund'
                  const isCashIn  = tx._type === 'cash_in'
                  const isCashOut = tx._type === 'cash_out'
                  const isPositive = isSale || isCashIn
                  const amountColor  = isPositive ? 'text-green-600' : 'text-red-500'
                  const amountPrefix = isPositive ? '+' : '-'
                  const isExpanded   = expanded === tx.id

                  return (
                    <React.Fragment key={`${tx._type}-${tx.id}`}>
                      <tr
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => (isSale || isRefund) ? setExpanded(isExpanded ? null : tx.id) : undefined}
                      >
                        {/* Time */}
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          <p>{new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(tx._time)}</p>
                          <p className="text-gray-400">{new Intl.DateTimeFormat('en-US', { timeZone: shopTimezone, hour: '2-digit', minute: '2-digit' }).format(tx._time)}</p>
                        </td>

                        {/* Ref # */}
                        <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">{tx._ref}</td>

                        {/* Type badge */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {isSale && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                              <Receipt className="w-2.5 h-2.5" /> Sale
                            </span>
                          )}
                          {isRefund && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                              <Ban className="w-2.5 h-2.5" /> Refund
                            </span>
                          )}
                          {isCashIn && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              <ArrowDownCircle className="w-2.5 h-2.5" /> Cash In
                            </span>
                          )}
                          {isCashOut && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                              <ArrowUpCircle className="w-2.5 h-2.5" /> Cash Out
                            </span>
                          )}
                        </td>

                        {/* Staff */}
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{tx._staff}</td>

                        {/* Shift date */}
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{tx._shift_date}</td>

                        {/* Items / Note */}
                        <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                          {(isSale || isRefund) ? (
                            <div className="space-y-0.5">
                              {(receiptItems[tx.id] || []).slice(0, 2).map((it: any, j: number) => (
                                <div key={j} className="truncate">{it.quantity}× {it.item_name}</div>
                              ))}
                              {(receiptItems[tx.id] || []).length > 2 && (
                                <div className="text-gray-400">+{(receiptItems[tx.id] || []).length - 2} more</div>
                              )}
                              {tx.note && <div className="text-amber-600 truncate">📝 {tx.note}</div>}
                              {isRefund && tx.void_note && <div className="text-red-400 truncate text-[10px]">{tx.void_note}</div>}
                            </div>
                          ) : (
                            <span className="text-gray-400">{tx.note || '—'}</span>
                          )}
                        </td>

                        {/* Payment */}
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{tx._payment}</td>

                        {/* Amount */}
                        <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${amountColor}`}>
                          {amountPrefix}{currencySymbol}{tx._amount.toFixed(2)}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5 text-center">
                          {(isSale || isRefund) ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                              tx.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              tx.status === 'voided'    ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {tx.status || '—'}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-0.5">
                            {isSale && (
                              <>
                                <button onClick={e => { e.stopPropagation(); requestAction('reprint', tx) }} title="Reprint"
                                  className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); requestAction('edit', tx) }} title="Edit"
                                  className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); requestAction('void', tx) }} title="Void"
                                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {isRefund && (
                              <button onClick={e => { e.stopPropagation(); requestAction('reprint', tx) }} title="Reprint void"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(isCashIn || isCashOut) && (
                              <span className="text-gray-300 text-xs px-2">—</span>
                            )}
                          </div>
                        </td>

                        {/* Expand toggle */}
                        <td className="px-2 py-2.5">
                          {(isSale || isRefund) && (
                            isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded item detail */}
                      {isExpanded && (isSale || isRefund) && (
                        <tr key={`${tx.id}-detail`}>
                          <td colSpan={11} className="px-4 pb-4 bg-gray-50">
                            <div className="border border-gray-200 rounded-xl overflow-hidden mt-1">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100 bg-white">
                                    <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Item</th>
                                    <th className="text-center text-xs font-medium text-gray-400 px-3 py-2">Qty</th>
                                    <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Unit price</th>
                                    <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {(receiptItems[tx.id] || []).map((ri: any) => (
                                    <tr key={ri.id} className="bg-white">
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-gray-800">{ri.item_name}</p>
                                        {ri.addons && ri.addons.length > 0 && (
                                          <div className="mt-0.5 space-y-0.5">
                                            {ri.addons.map((a: any, i: number) => (
                                              <p key={i} className="text-xs text-indigo-500">
                                                + {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''} ({currencySymbol}{(a.price * a.quantity).toFixed(2)})
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        {ri.note && <p className="text-xs text-amber-600 mt-0.5">📝 {ri.note}</p>}
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-700">{ri.quantity}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{currencySymbol}{Number(ri.unit_price).toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-medium text-gray-900">{currencySymbol}{Number(ri.line_total).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">{filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}</p>
    </div>
  )
}
