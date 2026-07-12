'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { Trash2, Plus, Minus, ShoppingCart, Tag, Percent, ChevronDown, X, Check, FileText, Pencil, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShop } from '@/lib/hooks/useShop'
import { createClient } from '@/lib/supabase/client'
import PaymentModal from './PaymentModal'

interface CartProps {
  diningOption?: any
  activeShiftId?: string | null
  cashierName?: string
  onPaymentComplete?: () => void
  onEditItem?: (cartItemId: string) => void
}

type TaxRate = { id: string; name: string; rate: number; is_active: boolean }
export type Discount = { id: string; name: string; type: 'percent' | 'fixed'; value: number; is_active: boolean }
export type ItemDiscount = { discount: Discount; amount: number; idRef?: string }

// ── Discount Picker Modal ─────────────────────────────────────────────────────
function DiscountPickerModal({
  discounts,
  currentDiscount,
  currencySymbol,
  lineTotal,
  onSelect,
  onClose,
}: {
  discounts: Discount[]
  currentDiscount: ItemDiscount | null
  currencySymbol: string
  lineTotal: number
  onSelect: (discount: Discount | null, idRef?: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Discount | null>(currentDiscount?.discount || null)
  const [pwdId, setPwdId] = useState(currentDiscount?.idRef || '')
  const [pwdError, setPwdError] = useState(false)

  const isPwd = (d: Discount | null) =>
    d?.name?.toLowerCase().includes('pwd') ?? false

  function handleApply() {
    if (!selected) {
      onSelect(null)
      return
    }
    if (isPwd(selected)) {
      if (!pwdId.trim()) {
        setPwdError(true)
        return
      }
      onSelect(selected, pwdId.trim())
    } else {
      onSelect(selected)
    }
  }

  function handlePickDiscount(d: Discount) {
    const picking = selected?.id === d.id ? null : d
    setSelected(picking)
    setPwdError(false)
    // Reset PWD id when switching away from a PWD discount
    if (!isPwd(picking)) setPwdId('')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Select Discount</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {/* Clear option */}
          <button
            onClick={() => setSelected(null)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
              selected === null
                ? 'border-gray-400 bg-gray-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <p className="text-sm text-gray-500">No discount</p>
            {selected === null && <Check className="w-4 h-4 text-gray-500 flex-shrink-0" />}
          </button>

          {discounts.map(d => {
            const isSelected = selected?.id === d.id
            const previewAmt = d.type === 'percent'
              ? Math.min(lineTotal * (d.value / 100), lineTotal)
              : Math.min(d.value, lineTotal)
            return (
              <button
                key={d.id}
                onClick={() => handlePickDiscount(d)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                  isSelected
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 hover:border-green-200 hover:bg-gray-50'
                }`}
              >
                <div>
                  <p className={`text-sm font-medium ${isSelected ? 'text-green-800' : 'text-gray-800'}`}>
                    {d.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {d.type === 'percent' ? `${d.value}%` : `${currencySymbol}${d.value.toFixed(2)}`}
                    {' '}— saves {currencySymbol}{previewAmt.toFixed(2)}
                  </p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
              </button>
            )
          })}

          {/* PWD ID field — shown when a PWD discount is selected */}
          {isPwd(selected) && (
            <div className="pt-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                PWD ID Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pwdId}
                onChange={e => { setPwdId(e.target.value); setPwdError(false) }}
                placeholder="Enter PWD ID number"
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-300 ${
                  pwdError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                }`}
              />
              {pwdError && (
                <p className="text-xs text-red-500 mt-1">PWD ID number is required</p>
              )}
            </div>
          )}
        </div>

        <div className="px-3 pb-4 flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={isPwd(selected) && !pwdId.trim()}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item Edit Modal (discount + note) ────────────────────────────────────────
function ItemEditModal({
  item,
  discounts,
  currentDiscount,
  currentNote,
  currencySymbol,
  onApply,
  onRemove,
  onClose,
  onEditVariants,
}: {
  item: any
  discounts: Discount[]
  currentDiscount: ItemDiscount | null
  currentNote: string
  currencySymbol: string
  onApply: (discount: Discount | null, note: string, idRef?: string) => void
  onRemove: () => void
  onClose: () => void
  onEditVariants?: () => void
}) {
  const [selectedDiscount, setSelectedDiscount] = useState<ItemDiscount | null>(currentDiscount)
  const [note, setNote] = useState(currentNote)
  const [showDiscountPicker, setShowDiscountPicker] = useState(false)

  function handleDiscountSelect(discount: Discount | null, idRef?: string) {
    if (!discount) {
      setSelectedDiscount(null)
    } else {
      const amount = discount.type === 'percent'
        ? Math.min(item.lineTotal * (discount.value / 100), item.lineTotal)
        : Math.min(discount.value, item.lineTotal)
      setSelectedDiscount({ discount, amount, idRef })
    }
    setShowDiscountPicker(false)
  }

  const hasVariantsOrAddons = item.variantId || (item.addons && item.addons.length > 0)

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">Edit Item</p>
              <p className="text-xs text-gray-400 truncate max-w-[180px]">{item.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Edit variants/addons button (Feature 1) */}
            {onEditVariants && (
              <button
                onClick={() => { onClose(); onEditVariants() }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-indigo-700">Edit Item</span>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-400" />
              </button>
            )}

            {/* Discount row — opens DiscountPickerModal (Feature 2) */}
            {discounts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Discount
                </p>
                <button
                  onClick={() => setShowDiscountPicker(true)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                    selectedDiscount
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-200 hover:border-green-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-left">
                    {selectedDiscount ? (
                      <>
                        <p className="text-sm font-medium text-green-800">{selectedDiscount.discount.name}</p>
                        <p className="text-xs text-green-600">
                          −{currencySymbol}{selectedDiscount.amount.toFixed(2)}
                          {selectedDiscount.idRef && (
                            <span className="text-gray-400"> · ID: {selectedDiscount.idRef}</span>
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Tap to select a discount…</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              </div>
            )}

            {/* Note section */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Note
              </p>
              <textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. No onions, extra sauce…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-300"
              />
            </div>
          </div>

          <div className="px-3 pb-4 flex gap-2">
            {(currentDiscount || currentNote) && (
              <button
                onClick={onRemove}
                className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => onApply(selectedDiscount?.discount ?? null, note.trim(), selectedDiscount?.idRef)}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Discount picker overlay (Feature 2 + 3) */}
      {showDiscountPicker && (
        <DiscountPickerModal
          discounts={discounts}
          currentDiscount={selectedDiscount}
          currencySymbol={currencySymbol}
          lineTotal={item.lineTotal}
          onSelect={handleDiscountSelect}
          onClose={() => setShowDiscountPicker(false)}
        />
      )}
    </>
  )
}

export default function Cart({ diningOption, activeShiftId, cashierName, onPaymentComplete, onEditItem }: CartProps) {
  const supabase = createClient()
  const { items, removeItem, updateQuantity, subtotal, discountAmount, setDiscount, clearCart } = useCart()
  const { currencySymbol } = useShop()

  const [showPayment, setShowPayment] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Tax state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [selectedTax, setSelectedTax] = useState<TaxRate | null>(null)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [showTaxDropdown, setShowTaxDropdown] = useState(false)

  // Receipt-level discount state
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null)
  const [discountEnabled, setDiscountEnabled] = useState(false)
  const [showDiscountDropdown, setShowDiscountDropdown] = useState(false)

  // Per-item discount state: itemId → ItemDiscount
  const [itemDiscounts, setItemDiscounts] = useState<Map<string, ItemDiscount>>(new Map())
  // Per-item note state: itemId → note string
  const [itemNotes, setItemNotes] = useState<Map<string, string>>(new Map())
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  // Order-level note (one note for the whole sale, e.g. "birthday, add candle")
  const [orderNote, setOrderNote] = useState('')
  const [showOrderNote, setShowOrderNote] = useState(false)

  // Ingredient stock limits: itemId → max makeable qty
  const [stockLimits, setStockLimits] = useState<Map<string, number>>(new Map())
  const [showStockPopup, setShowStockPopup] = useState(false)
  const [stockPopupMsg, setStockPopupMsg] = useState('')

  // Fetch ingredient-based stock limits for all cart items
  useEffect(() => {
    async function fetchStockLimits() {
      if (items.length === 0) { setStockLimits(new Map()); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users').select('shop_id').eq('auth_user_id', user.id).single()
      if (!appUser?.shop_id) return

      const productIds = [...new Set(items.map(i => i.itemId))]
      const variantIds = [...new Set(items.filter(i => i.variantId).map(i => i.variantId as string))]

      // Fetch recipes from both item_ingredients and item_variant_ingredients in parallel
      const [{ data: itemRecipes }, { data: variantRecipes }] = await Promise.all([
        supabase
          .from('item_ingredients')
          .select('item_id, ingredient_id, quantity')
          .in('item_id', productIds),
        variantIds.length > 0
          ? supabase
              .from('item_variant_ingredients')
              .select('variant_id, ingredient_id, quantity')
              .in('variant_id', variantIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const allIngredientIds = [
        ...new Set([
          ...(itemRecipes || []).map((r: any) => r.ingredient_id),
          ...(variantRecipes || []).map((r: any) => r.ingredient_id),
        ])
      ]

      if (allIngredientIds.length === 0) {
        // No recipes anywhere = no ingredient restriction for any cart line
        const unlimited = new Map(items.map(i => [i.id, Infinity]))
        setStockLimits(unlimited)
        return
      }

      // Fetch current stock for all involved ingredients from inventory_levels
      const { data: stocks } = await supabase
        .from('inventory_levels')
        .select('item_id, quantity')
        .in('item_id', allIngredientIds)
        .eq('shop_id', appUser.shop_id)
        .is('variant_id', null)

      const stockMap = new Map((stocks || []).map((s: any) => [s.item_id, Number(s.quantity)]))

      // Group recipes for lookup: variant_id -> rows, item_id -> rows
      const variantRecipeMap = new Map<string, any[]>()
      for (const r of variantRecipes || []) {
        if (!variantRecipeMap.has(r.variant_id)) variantRecipeMap.set(r.variant_id, [])
        variantRecipeMap.get(r.variant_id)!.push(r)
      }
      const itemRecipeMap = new Map<string, any[]>()
      for (const r of itemRecipes || []) {
        if (!itemRecipeMap.has(r.item_id)) itemRecipeMap.set(r.item_id, [])
        itemRecipeMap.get(r.item_id)!.push(r)
      }

      const limits = new Map<string, number>()
      for (const cartItem of items) {
        const recipe = cartItem.variantId
          ? (variantRecipeMap.get(cartItem.variantId) ?? itemRecipeMap.get(cartItem.itemId) ?? [])
          : (itemRecipeMap.get(cartItem.itemId) ?? [])

        if (recipe.length === 0) {
          limits.set(cartItem.id, Infinity)
          continue
        }

        const max = Math.min(
          ...recipe.map((r: any) => {
            const available = stockMap.get(r.ingredient_id) ?? 0
            return r.quantity > 0 ? Math.floor(available / r.quantity) : Infinity
          })
        )
        limits.set(cartItem.id, max)
      }
      setStockLimits(limits)
    }
    fetchStockLimits()
  }, [items])


  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('id, shop_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!appUser?.shop_id) return
      setCurrentUserId(appUser.id)

      const [{ data: taxes }, { data: discs }] = await Promise.all([
        supabase.from('tax_rates').select('*').eq('shop_id', appUser.shop_id).eq('is_active', true).order('created_at'),
        supabase.from('discounts').select('*').eq('shop_id', appUser.shop_id).eq('is_active', true).order('created_at'),
      ])

      setTaxRates(taxes || [])
      setDiscounts(discs || [])

      // Auto-select first tax rate if only one exists
      if (taxes && taxes.length === 1) {
        setSelectedTax(taxes[0])
      }
    }
    load()
  }, [])

  // Clear item discounts and notes for removed items
  useEffect(() => {
    const itemIds = new Set(items.map(i => i.id))
    setItemDiscounts(prev => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (!itemIds.has(key)) next.delete(key)
      }
      return next
    })
    setItemNotes(prev => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (!itemIds.has(key)) next.delete(key)
      }
      return next
    })
  }, [items])

  const sub = subtotal()
  const taxAmount = taxEnabled && selectedTax ? sub * (selectedTax.rate / 100) : 0

  // Total item-level discount
  const itemDiscountTotal = Array.from(itemDiscounts.values()).reduce((sum, d) => sum + d.amount, 0)

  const receiptLevelDiscount = (() => {
    if (!discountEnabled || !selectedDiscount) return 0
    const discountableBase = Math.max(0, sub - itemDiscountTotal)
    if (selectedDiscount.type === 'percent') return Math.min(discountableBase * (selectedDiscount.value / 100), discountableBase)
    return Math.min(selectedDiscount.value, discountableBase)
  })()

  const computedDiscount = itemDiscountTotal + receiptLevelDiscount

  // Keep zustand discount in sync
  useEffect(() => {
    setDiscount(computedDiscount)
  }, [computedDiscount])

  const tot = Math.max(0, sub + taxAmount - computedDiscount)

  function handleIncrement(item: any) {
    const max = stockLimits.get(item.id)
    if (max === undefined) {
      // Limits not loaded yet — allow
      updateQuantity(item.id, item.quantity + 1)
      return
    }
    if (max === 0) {
      setStockPopupMsg(`No available ingredients to make "${item.name}".`)
      setShowStockPopup(true)
      return
    }
    if (item.quantity >= max) {
      setStockPopupMsg(
        `You can only make ${max} of "${item.name}" with the current ingredients.`
      )
      setShowStockPopup(true)
      return
    }
    updateQuantity(item.id, item.quantity + 1)
  }


  function handleTaxToggle() {
    if (!taxEnabled && taxRates.length > 0 && !selectedTax) {
      setSelectedTax(taxRates[0])
    }
    setTaxEnabled(v => !v)
    setShowTaxDropdown(false)
  }

  function handleDiscountToggle() {
    if (!discountEnabled && discounts.length > 0 && !selectedDiscount) {
      setSelectedDiscount(discounts[0])
    }
    setDiscountEnabled(d => !d)
    setShowDiscountDropdown(false)
  }

  function handleApplyItemEdit(itemId: string, lineTotal: number, discount: Discount | null, note: string, idRef?: string) {
    if (discount) {
      const amount = discount.type === 'percent'
        ? Math.min(lineTotal * (discount.value / 100), lineTotal)
        : Math.min(discount.value, lineTotal)
      setItemDiscounts(prev => new Map(prev).set(itemId, { discount, amount, idRef }))
    } else {
      setItemDiscounts(prev => { const next = new Map(prev); next.delete(itemId); return next })
    }
    if (note) {
      setItemNotes(prev => new Map(prev).set(itemId, note))
    } else {
      setItemNotes(prev => { const next = new Map(prev); next.delete(itemId); return next })
    }
    setEditingItemId(null)
  }

  function handleRemoveItemEdit(itemId: string) {
    setItemDiscounts(prev => {
      const next = new Map(prev)
      next.delete(itemId)
      return next
    })
    setItemNotes(prev => {
      const next = new Map(prev)
      next.delete(itemId)
      return next
    })
    setEditingItemId(null)
  }

  const editingItem = editingItemId ? items.find(i => i.id === editingItemId) || null : null

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Stock limit popup */}
      {showStockPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowStockPopup(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Not Enough Ingredients</p>
              <button onClick={() => setShowStockPopup(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-600">{stockPopupMsg}</p>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowStockPopup(false)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}


      {editingItem && (
        <ItemEditModal
          item={editingItem}
          discounts={discounts}
          currentDiscount={itemDiscounts.get(editingItem.id) || null}
          currentNote={itemNotes.get(editingItem.id) || editingItem.note || ''}
          currencySymbol={currencySymbol}
          onApply={(discount, note, idRef) => handleApplyItemEdit(editingItem.id, editingItem.lineTotal, discount, note, idRef)}
          onRemove={() => handleRemoveItemEdit(editingItem.id)}
          onClose={() => setEditingItemId(null)}
          onEditVariants={onEditItem ? () => onEditItem(editingItem.id) : undefined}
        />
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Order</span>
          {diningOption && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {diningOption?.name}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700">
            Clear
          </button>
        )}
      </div>

      {/* Items */}
  <div
    className="flex-1 overflow-y-auto min-h-0 touch-pan-y"
    style={{ WebkitOverflowScrolling: 'touch' }}
  >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
            <ShoppingCart className="w-8 h-8" />
            <p className="text-sm">No items yet</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {items.map(item => {
              const itemDisc = itemDiscounts.get(item.id)
              const itemNote = itemNotes.get(item.id) || item.note
              return (
                <div
                  key={item.id}
                  className={`rounded-lg p-3 cursor-pointer transition-all ${
                    itemDisc
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200'
                  }`}
                  onClick={() => setEditingItemId(item.id)}
                  title="Tap to edit discount or note"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      {item.addons && item.addons.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.addons.map((a: any) => (
                            <p key={a.id} className="text-xs text-indigo-600">
                              + {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''} ({currencySymbol}{(a.price * a.quantity).toFixed(2)})
                            </p>
                          ))}
                        </div>
                      )}
                      {itemNote && (
                        <p className="text-xs text-amber-600 mt-0.5">📝 {itemNote}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {currencySymbol}{item.price.toFixed(2)}
                        {item.addons?.length > 0 && <span> + addons</span>} each
                      </p>
                      {itemDisc && (
                        <p className="text-xs text-green-600 font-medium mt-0.5">
                          <Tag className="w-3 h-3 inline mr-0.5" />
                          {itemDisc.discount.name} −{currencySymbol}{itemDisc.amount.toFixed(2)}
                          {itemDisc.idRef && (
                            <span className="text-gray-400"> · ID: {itemDisc.idRef}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeItem(item.id) }}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleIncrement(item)}
                        disabled={(() => { const m = stockLimits.get(item.id); return m !== undefined && m !== Infinity && item.quantity >= m })()} 
                        className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-right">
                      {itemDisc ? (
                        <div>
                          <p className="text-xs line-through text-gray-400">{currencySymbol}{item.lineTotal.toFixed(2)}</p>
                          <p className="text-sm font-semibold text-green-700">{currencySymbol}{(item.lineTotal - itemDisc.amount).toFixed(2)}</p>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-gray-900">{currencySymbol}{item.lineTotal.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tax + Discount toggles */}
      {items.length > 0 && (
        <div className="border-t border-gray-100 px-4 pt-3 pb-1 space-y-2">

          {/* Tax toggle */}
          {taxRates.length > 0 && (
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTaxToggle}
                  className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${taxEnabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
                >
                  <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${taxEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <Percent className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-600">Tax</span>
              </div>
              {taxEnabled && (
                <div className="relative">
                  <button
                    onClick={() => setShowTaxDropdown(v => !v)}
                    className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    <span>{selectedTax ? `${selectedTax.name} (${selectedTax.rate}%)` : 'Select'}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {showTaxDropdown && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-36 overflow-hidden">
                      {taxRates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTax(t); setShowTaxDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${selectedTax?.id === t.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                        >
                          {t.name} — {t.rate}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No tax rates configured */}
          {taxRates.length === 0 && (
            <div className="flex items-center gap-2 opacity-40">
              <div className="w-8 h-4 rounded-full bg-gray-200 flex-shrink-0" />
              <Percent className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">No tax rates configured</span>
            </div>
          )}

          {/* Receipt-level discount toggle */}
          {discounts.length > 0 && (
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscountToggle}
                  className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${discountEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                >
                  <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${discountEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-600">Discount</span>
              </div>
              {discountEnabled && (
                <div className="relative">
                  <button
                    onClick={() => setShowDiscountDropdown(v => !v)}
                    className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    <span>
                      {selectedDiscount
                        ? `${selectedDiscount.name} (${selectedDiscount.type === 'percent' ? `${selectedDiscount.value}%` : `${currencySymbol}${selectedDiscount.value.toFixed(2)}`})`
                        : 'Select'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {showDiscountDropdown && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-40 overflow-hidden">
                      {discounts.map(d => (
                        <button
                          key={d.id}
                          onClick={() => { setSelectedDiscount(d); setShowDiscountDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${selectedDiscount?.id === d.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'}`}
                        >
                          {d.name} — {d.type === 'percent' ? `${d.value}%` : `${currencySymbol}${d.value.toFixed(2)}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No discounts configured */}
          {discounts.length === 0 && (
            <div className="flex items-center gap-2 opacity-40">
              <div className="w-8 h-4 rounded-full bg-gray-200 flex-shrink-0" />
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">No discounts configured</span>
            </div>
          )}

        </div>
      )}

      {/* Totals + Checkout */}
      <div className="shrink-0 border-t border-gray-100 p-4 space-y-3 bg-white">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{currencySymbol}{sub.toFixed(2)}</span>
          </div>
          {taxEnabled && selectedTax && taxAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>{selectedTax.name} ({selectedTax.rate}%)</span>
              <span>+{currencySymbol}{taxAmount.toFixed(2)}</span>
            </div>
          )}
          {itemDiscountTotal > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Item discounts</span>
              <span>-{currencySymbol}{itemDiscountTotal.toFixed(2)}</span>
            </div>
          )}
          {discountEnabled && selectedDiscount && receiptLevelDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>{selectedDiscount.name}</span>
              <span>-{currencySymbol}{receiptLevelDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 text-base pt-1 border-t border-gray-100">
            <span>Total</span>
            <span>{currencySymbol}{tot.toFixed(2)}</span>
          </div>
        </div>

        {items.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center -mt-1">Tap any item to add a discount or note</p>
        )}

        {items.length > 0 && (
          <div>
            {showOrderNote ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Order note
                  </label>
                  {!orderNote && (
                    <button
                      onClick={() => setShowOrderNote(false)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Hide
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={orderNote}
                  onChange={e => setOrderNote(e.target.value)}
                  placeholder="e.g. Birthday — add a candle"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-300"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowOrderNote(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                <FileText className="w-3 h-3" /> Add a note for this order
              </button>
            )}
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={items.length === 0}
          onClick={() => setShowPayment(true)}
        >
          Charge {currencySymbol}{tot.toFixed(2)}
        </Button>
      </div>

      {showPayment && (
        <PaymentModal
          total={tot}
          itemNotes={itemNotes}
          itemDiscounts={itemDiscounts}
          employeeId={currentUserId ?? undefined}
          cashierName={cashierName}
          diningOption={diningOption}
          orderNote={orderNote}
          onClose={() => setShowPayment(false)}
          onPaymentComplete={() => {
            setShowPayment(false)
            setOrderNote('')
            setShowOrderNote(false)
            onPaymentComplete?.()
          }}
        />
      )}
    </div>
  )
}
