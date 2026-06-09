'use client'

import { useState } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { X, Plus, Minus, Check } from 'lucide-react'

interface Props {
  items: any[]
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id: string
  name: string
  price: number
  addon_categories: { category_id: string; multiple_select: boolean }[]
}

type AddonItem = {
  id: string
  name: string
  price: number
  category_id: string
  category_name: string
  multiple_select: boolean
}

type SelectedAddon = {
  id: string
  name: string
  price: number
  quantity: number
}

// ── Item Selection Modal ──────────────────────────────────────────────────────

function ItemSelectModal({
  item,
  onClose,
  onConfirm,
}: {
  item: any
  onClose: () => void
  onConfirm: (variant: Variant | null, addons: SelectedAddon[]) => void
}) {
  const supabase = createClient()

  const [step, setStep] = useState<'variant' | 'addons'>('variant')
  const [variants, setVariants] = useState<Variant[]>([])
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)

  const [addonItems, setAddonItems] = useState<AddonItem[]>([])
  const [loadingAddons, setLoadingAddons] = useState(false)
  const [selectedAddons, setSelectedAddons] = useState<Map<string, SelectedAddon>>(new Map())

  // Load variants on mount if item has variants
  useState(() => {
    if (!item.has_variants) {
      // No variants — go straight to addons if applicable
      if (item.offer_addons) {
        setStep('addons')
        loadItemAddons(item.id)
      }
      return
    }
    loadVariants()
  })

  async function loadVariants() {
    setLoadingVariants(true)
    try {
      // Fetch variants
      const { data: variantRows } = await supabase
        .from('item_variants')
        .select('id, name, price')
        .eq('item_id', item.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (!variantRows || variantRows.length === 0) {
        // No active variants — treat as plain item
        if (item.offer_addons) {
          setStep('addons')
          loadItemAddons(item.id)
        } else {
          onConfirm(null, [])
        }
        return
      }

      // Fetch per-variant addon categories
      const variantIds = variantRows.map((v: any) => v.id)
      const { data: addonCatRows } = await supabase
        .from('item_variant_addon_categories')
        .select('variant_id, category_id, multiple_select')
        .in('variant_id', variantIds)

      const addonCatMap: Record<string, { category_id: string; multiple_select: boolean }[]> = {}
      for (const row of addonCatRows ?? []) {
        if (!addonCatMap[row.variant_id]) addonCatMap[row.variant_id] = []
        addonCatMap[row.variant_id].push({
          category_id: row.category_id,
          multiple_select: row.multiple_select ?? false,
        })
      }

      const mapped: Variant[] = variantRows.map((v: any) => ({
        id: v.id,
        name: v.name,
        price: Number(v.price),
        addon_categories: addonCatMap[v.id] ?? [],
      }))

      setVariants(mapped)
      setStep('variant')
    } finally {
      setLoadingVariants(false)
    }
  }

  async function loadItemAddons(itemId: string) {
    setLoadingAddons(true)
    try {
      // Fetch item-level addon category assignments
      const { data: catAssignments } = await supabase
        .from('item_addon_categories')
        .select('category_id, multiple_select')
        .eq('item_id', itemId)

      if (!catAssignments || catAssignments.length === 0) {
        // No addon categories configured — skip straight to confirm
        onConfirm(selectedVariant, [])
        return
      }

      const categoryIds = catAssignments.map((c: any) => c.category_id)

      // Fetch all active items in those categories
      const { data: addonRows } = await supabase
        .from('items')
        .select('id, name, price, category_id, categories(name)')
        .in('category_id', categoryIds)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (!addonRows || addonRows.length === 0) {
        onConfirm(selectedVariant, [])
        return
      }

      // Build multiple_select lookup by category_id
      const multiMap: Record<string, boolean> = {}
      for (const ca of catAssignments) {
        multiMap[ca.category_id] = ca.multiple_select ?? false
      }

      const mapped: AddonItem[] = addonRows.map((r: any) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category_id: r.category_id,
        category_name: r.categories?.name ?? '',
        multiple_select: multiMap[r.category_id] ?? false,
      }))

      setAddonItems(mapped)
      setStep('addons')
    } finally {
      setLoadingAddons(false)
    }
  }

  async function loadVariantAddons(variant: Variant) {
    if (variant.addon_categories.length === 0) {
      // Variant has no addon categories
      onConfirm(variant, [])
      return
    }

    setLoadingAddons(true)
    try {
      const categoryIds = variant.addon_categories.map(ac => ac.category_id)

      const { data: addonRows } = await supabase
        .from('items')
        .select('id, name, price, category_id, categories(name)')
        .in('category_id', categoryIds)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (!addonRows || addonRows.length === 0) {
        onConfirm(variant, [])
        return
      }

      const multiMap: Record<string, boolean> = {}
      for (const ac of variant.addon_categories) {
        multiMap[ac.category_id] = ac.multiple_select ?? false
      }

      const mapped: AddonItem[] = addonRows.map((r: any) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category_id: r.category_id,
        category_name: r.categories?.name ?? '',
        multiple_select: multiMap[r.category_id] ?? false,
      }))

      setAddonItems(mapped)
      setStep('addons')
    } finally {
      setLoadingAddons(false)
    }
  }

  function handleVariantSelect(variant: Variant) {
    setSelectedVariant(variant)
    setSelectedAddons(new Map())
    loadVariantAddons(variant)
  }

  function toggleAddon(addon: AddonItem) {
    setSelectedAddons(prev => {
      const next = new Map(prev)
      if (next.has(addon.id)) {
        next.delete(addon.id)
      } else {
        // If single-select: remove other addons in the same category
        if (!addon.multiple_select) {
          for (const [id, a] of next.entries()) {
            if ((a as any).category_id === addon.category_id) next.delete(id)
          }
        }
        next.set(addon.id, { id: addon.id, name: addon.name, price: addon.price, quantity: 1, ...(addon as any) })
      }
      return next
    })
  }

  function adjustAddonQty(addonId: string, delta: number) {
    setSelectedAddons(prev => {
      const next = new Map(prev)
      const existing = next.get(addonId)
      if (!existing) return prev
      const newQty = existing.quantity + delta
      if (newQty <= 0) {
        next.delete(addonId)
      } else {
        next.set(addonId, { ...existing, quantity: newQty })
      }
      return next
    })
  }

  function handleConfirm() {
    onConfirm(selectedVariant, Array.from(selectedAddons.values()))
  }

  // Group addons by category for display
  const addonsByCategory = addonItems.reduce((acc, addon) => {
    if (!acc[addon.category_id]) {
      acc[addon.category_id] = { name: addon.category_name, multiple_select: addon.multiple_select, items: [] }
    }
    acc[addon.category_id].items.push(addon)
    return acc
  }, {} as Record<string, { name: string; multiple_select: boolean; items: AddonItem[] }>)

  const finalPrice = selectedVariant
    ? selectedVariant.price + Array.from(selectedAddons.values()).reduce((s, a) => s + a.price * a.quantity, 0)
    : Number(item.price) + Array.from(selectedAddons.values()).reduce((s, a) => s + a.price * a.quantity, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900">{item.name}</p>
            {step === 'addons' && selectedVariant && (
              <p className="text-xs text-indigo-600">{selectedVariant.name}</p>
            )}
            {step === 'addons' && (
              <p className="text-xs text-gray-400">Choose add-ons</p>
            )}
            {step === 'variant' && (
              <p className="text-xs text-gray-400">Choose a variant</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* ── Variant step ── */}
          {step === 'variant' && (
            <>
              {loadingVariants ? (
                <div className="text-center py-8 text-sm text-gray-400">Loading variants…</div>
              ) : (
                <div className="space-y-2">
                  {variants.map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleVariantSelect(v)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all text-left"
                    >
                      <span className="text-sm font-medium text-gray-900">{v.name}</span>
                      <span className="text-sm font-semibold text-indigo-600">${v.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Add-ons step ── */}
          {step === 'addons' && (
            <>
              {loadingAddons ? (
                <div className="text-center py-8 text-sm text-gray-400">Loading add-ons…</div>
              ) : addonItems.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">No add-ons available</div>
              ) : (
                Object.entries(addonsByCategory).map(([catId, group]) => (
                  <div key={catId}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.name}</p>
                      <span className="text-[10px] text-gray-300">
                        {group.multiple_select ? 'Multi-select' : 'Pick one'}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map(addon => {
                        const selected = selectedAddons.get(addon.id)
                        return (
                          <div
                            key={addon.id}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                              selected
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                            }`}
                            onClick={() => toggleAddon(addon)}
                          >
                            <div className="flex items-center gap-2">
                              {selected ? (
                                <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                              )}
                              <span className={`text-sm ${selected ? 'font-medium text-indigo-900' : 'text-gray-800'}`}>
                                {addon.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              {selected && addon.multiple_select && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => adjustAddonQty(addon.id, -1)}
                                    className="w-5 h-5 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center"
                                  >
                                    <Minus className="w-2.5 h-2.5 text-indigo-700" />
                                  </button>
                                  <span className="text-xs font-medium text-indigo-700 w-4 text-center">
                                    {selected.quantity}
                                  </span>
                                  <button
                                    onClick={() => adjustAddonQty(addon.id, 1)}
                                    className="w-5 h-5 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center"
                                  >
                                    <Plus className="w-2.5 h-2.5 text-indigo-700" />
                                  </button>
                                </div>
                              )}
                              <span className={`text-sm font-semibold ${selected ? 'text-indigo-600' : 'text-gray-500'}`}>
                                +${addon.price.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

        </div>

        {/* Footer — only shown on addons step or plain item */}
        {step === 'addons' && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
            {step === 'addons' && selectedVariant && (
              <button
                onClick={() => { setStep('variant'); setSelectedAddons(new Map()) }}
                className="text-xs text-indigo-500 hover:text-indigo-700 mb-2 block"
              >
                ← Back to variants
              </button>
            )}
            <button
              onClick={handleConfirm}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Add to order · ${finalPrice.toFixed(2)}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Main ItemGrid ─────────────────────────────────────────────────────────────

export default function ItemGrid({ items }: Props) {
  const { addItem } = useCart()
  const [pendingItem, setPendingItem] = useState<any | null>(null)

  function handleTap(item: any) {
    // If item has variants OR item-level add-ons, open the modal
    if (item.has_variants || item.offer_addons) {
      setPendingItem(item)
    } else {
      // Plain item — add directly
      addItem({
        itemId: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        modifiers: [],
        trackStock: item.track_stock,
        addons: [],
      })
      toast.success(`${item.name} added`)
    }
  }

  function handleConfirm(item: any, variant: any | null, addons: SelectedAddon[]) {
    const price = variant ? variant.price : Number(item.price)
    const name = variant ? `${item.name} — ${variant.name}` : item.name

    addItem({
      itemId: item.id,
      variantId: variant?.id ?? undefined,
      name,
      price,
      quantity: 1,
      modifiers: [],
      trackStock: item.track_stock,
      addons: addons.map(a => ({ id: a.id, name: a.name, price: a.price, quantity: a.quantity })),
    })

    toast.success(`${name} added`)
    setPendingItem(null)
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => handleTap(item)}
            className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-indigo-300 hover:shadow-sm active:scale-95 transition-all"
          >
            {/* Color bar from category */}
            <div
              className="w-full h-1 rounded-full mb-2"
              style={{ backgroundColor: item.categories?.color || '#e5e7eb' }}
            />
            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
            {item.categories && (
              <p className="text-xs text-gray-400 truncate">{item.categories.name}</p>
            )}
            <p className="text-sm font-semibold text-indigo-600 mt-1">
              {item.has_variants ? 'From ' : ''}${Number(item.price).toFixed(2)}
            </p>
            {(item.has_variants || item.offer_addons) && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                {item.has_variants ? 'Variants available' : 'Add-ons available'}
              </p>
            )}
          </button>
        ))}
      </div>

      {pendingItem && (
        <ItemSelectModal
          item={pendingItem}
          onClose={() => setPendingItem(null)}
          onConfirm={(variant, addons) => handleConfirm(pendingItem, variant, addons)}
        />
      )}
    </>
  )
}
