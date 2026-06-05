'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { X, Trash2, Plus, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { Item, ItemLevel, Category } from '@/lib/types/database'

type Props = {
  item: Item | null
  allItems: Item[]
  levels: ItemLevel[]
  categories: Category[]
  shopId: string
  onClose: () => void
  onSaved: () => void
}

type Ingredient = { ingredient_id: string; quantity: number }

type Variant = {
  id?: string           // undefined = new (not saved yet)
  name: string
  price: string
  cost: number          // auto-calculated from ingredients
  ingredients: Ingredient[]
  expanded: boolean
  ingSearch: string
  showIngSearch: boolean
}

type FormState = {
  name: string
  description: string
  sku: string
  barcode: string
  price: string
  cost: string
  category_id: string
  level_id: string
  is_composite: boolean
  has_variants: boolean
  offer_addons: boolean
  addon_category_id: string
  is_active: boolean
  track_stock: boolean
  sold_by_weight: boolean
  tax_rate: string
  ingredients: Ingredient[]
  variants: Variant[]
}

function calcCost(ingredients: Ingredient[], allItems: Item[]): number {
  return ingredients.reduce((sum, ing) => {
    const found = allItems.find(i => i.id === ing.ingredient_id)
    return sum + (found ? (found.cost ?? 0) * ing.quantity : 0)
  }, 0)
}

function newVariant(): Variant {
  return { name: '', price: '', cost: 0, ingredients: [], expanded: true, ingSearch: '', showIngSearch: false }
}

export default function ItemEditor({ item, allItems, levels, categories, shopId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const isNew = !item
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ingSearch, setIngSearch] = useState('')
  const [showIngSearch, setShowIngSearch] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)

  const [form, setForm] = useState<FormState>({
    name: '', description: '', sku: '', barcode: '', price: '', cost: '',
    category_id: '', level_id: '', is_composite: false, has_variants: false,
    offer_addons: false, addon_category_id: '',
    is_active: true, track_stock: false, sold_by_weight: false, tax_rate: '0',
    ingredients: [], variants: [],
  })

  // Auto-generate next SKU for new items
  useEffect(() => {
    if (!isNew) return
    async function generateSku() {
      setSkuLoading(true)
      try {
        // Fetch all SKUs for this shop that match the numeric pattern
        const { data } = await supabase
          .from('items')
          .select('sku')
          .eq('shop_id', shopId)
          .not('sku', 'is', null)
          .order('created_at', { ascending: false })

        let nextNum = 1
        if (data && data.length > 0) {
          // Extract numeric suffixes from SKUs like "SKU-0001", "0042", "ITEM-005", etc.
          const nums = data
            .map(r => r.sku as string)
            .map(s => {
              const match = s.match(/(\d+)$/)
              return match ? parseInt(match[1], 10) : 0
            })
            .filter(n => n > 0)
          if (nums.length > 0) {
            nextNum = Math.max(...nums) + 1
          }
        }

        // Format with leading zeros, minimum 4 digits
        const padded = String(nextNum).padStart(4, '0')
        set('sku', `SKU-${padded}`)
      } finally {
        setSkuLoading(false)
      }
    }
    generateSku()
  }, [isNew, shopId])

  // Load item data including variants
  useEffect(() => {
    if (!item) return
    async function loadVariants() {
      const { data: variantRows } = await supabase
        .from('item_variants')
        .select('*, item_variant_ingredients(*)')
        .eq('item_id', item!.id)
        .order('sort_order', { ascending: true })

      const variants: Variant[] = (variantRows ?? []).map(v => ({
        id: v.id,
        name: v.name,
        price: String(v.price),
        cost: v.cost,
        expanded: false,
        ingSearch: '',
        showIngSearch: false,
        ingredients: (v.item_variant_ingredients ?? []).map((vi: any) => ({
          ingredient_id: vi.ingredient_id,
          quantity: vi.quantity,
        })),
      }))

      setForm({
        name: item!.name,
        description: item!.description ?? '',
        sku: item!.sku ?? '',
        barcode: item!.barcode ?? '',
        price: item!.price ? String(item!.price) : '',
        cost: item!.cost ? String(item!.cost) : '',
        category_id: item!.category_id ?? '',
        level_id: item!.level_id ?? '',
        is_composite: item!.is_composite ?? false,
        has_variants: (item as any).has_variants ?? false,
        offer_addons: (item as any).offer_addons ?? false,
        addon_category_id: (item as any).addon_category_id ?? '',
        is_active: item!.is_active,
        track_stock: item!.track_stock,
        sold_by_weight: item!.sold_by_weight,
        tax_rate: String(item!.tax_rate ?? 0),
        ingredients: (item!.ingredients ?? []).map(i => ({
          ingredient_id: i.ingredient_id,
          quantity: i.quantity,
        })),
        variants,
      })
    }
    loadVariants()
  }, [item])

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const currentLevel = levels.find(l => l.id === form.level_id)
  const isFinalProduct = currentLevel?.is_sellable ?? false
  const bomCost = calcCost(form.ingredients, allItems)

  function handleLevelChange(levelId: string) {
    set('level_id', levelId)
    const level = levels.find(l => l.id === levelId)
    if (!level?.is_sellable) set('price', '')
  }

  // ── BOM ingredient helpers ──────────────────────────────────────────────────
  const usedIds = new Set(form.ingredients.map(i => i.ingredient_id))
  const availableIngredients = allItems.filter(i => i.id !== item?.id && !usedIds.has(i.id))
  const filteredIngredients = availableIngredients.filter(i =>
    !ingSearch ||
    i.name.toLowerCase().includes(ingSearch.toLowerCase()) ||
    (i.sku ?? '').toLowerCase().includes(ingSearch.toLowerCase())
  )

  function addIngredient(ingredientId: string) {
    set('ingredients', [...form.ingredients, { ingredient_id: ingredientId, quantity: 1 }])
    setIngSearch('')
    setShowIngSearch(false)
  }

  function removeIngredient(ingredientId: string) {
    set('ingredients', form.ingredients.filter(i => i.ingredient_id !== ingredientId))
  }

  function updateQty(ingredientId: string, qty: number) {
    set('ingredients', form.ingredients.map(i =>
      i.ingredient_id === ingredientId ? { ...i, quantity: qty } : i
    ))
  }

  // ── Variant helpers ─────────────────────────────────────────────────────────
  function addVariant() {
    set('variants', [...form.variants, newVariant()])
  }

  function removeVariant(idx: number) {
    set('variants', form.variants.filter((_, i) => i !== idx))
  }

  function updateVariant(idx: number, patch: Partial<Variant>) {
    set('variants', form.variants.map((v, i) => {
      if (i !== idx) return v
      const updated = { ...v, ...patch }
      // Recalculate cost whenever ingredients change
      if (patch.ingredients !== undefined) {
        updated.cost = calcCost(patch.ingredients, allItems)
      }
      return updated
    }))
  }

  function addVariantIngredient(variantIdx: number, ingredientId: string) {
    const v = form.variants[variantIdx]
    const newIngs = [...v.ingredients, { ingredient_id: ingredientId, quantity: 1 }]
    updateVariant(variantIdx, { ingredients: newIngs, ingSearch: '', showIngSearch: false })
  }

  function removeVariantIngredient(variantIdx: number, ingredientId: string) {
    const v = form.variants[variantIdx]
    updateVariant(variantIdx, {
      ingredients: v.ingredients.filter(i => i.ingredient_id !== ingredientId),
    })
  }

  function updateVariantQty(variantIdx: number, ingredientId: string, qty: number) {
    const v = form.variants[variantIdx]
    updateVariant(variantIdx, {
      ingredients: v.ingredients.map(i =>
        i.ingredient_id === ingredientId ? { ...i, quantity: qty } : i
      ),
    })
  }

  function getVariantIngredientOptions(variantIdx: number) {
    const used = new Set(form.variants[variantIdx].ingredients.map(i => i.ingredient_id))
    return allItems.filter(i => i.id !== item?.id && !used.has(i.id))
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) { toast.error('Item name is required'); return }

    // Validate variants
    if (form.has_variants) {
      if (form.variants.length === 0) { toast.error('Add at least one variant'); return }
      for (const v of form.variants) {
        if (!v.name.trim()) { toast.error('All variants need a name'); return }
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        sku: form.sku || null,
        barcode: form.barcode || null,
        price: isFinalProduct ? (parseFloat(form.price) || 0) : 0,
        cost: form.is_composite ? bomCost : (parseFloat(form.cost) || 0),
        category_id: form.category_id || null,
        level_id: form.level_id || null,
        is_composite: form.is_composite,
        has_variants: form.has_variants,
        offer_addons: form.offer_addons,
        addon_category_id: form.addon_category_id || null,
        is_active: form.is_active,
        track_stock: form.track_stock,
        sold_by_weight: form.sold_by_weight,
        tax_rate: parseFloat(form.tax_rate) || 0,
        updated_at: new Date().toISOString(),
      }

      let itemId = item?.id

      if (isNew) {
        const { data, error } = await supabase
          .from('items').insert({ ...payload, shop_id: shopId }).select('id').single()
        if (error) throw error
        itemId = data.id
      } else {
        const { error } = await supabase.from('items').update(payload).eq('id', item!.id)
        if (error) throw error
      }

      // Save BOM
      await supabase.from('item_ingredients').delete().eq('item_id', itemId!)
      if (form.is_composite && form.ingredients.length > 0) {
        const rows = form.ingredients
          .filter(i => i.ingredient_id && i.quantity > 0)
          .map(i => ({ shop_id: shopId, item_id: itemId!, ingredient_id: i.ingredient_id, quantity: i.quantity }))
        if (rows.length > 0) {
          const { error } = await supabase.from('item_ingredients').insert(rows)
          if (error) throw error
        }
      }

      // Save variants
      if (form.has_variants) {
        // Delete removed variants (those with id not in current list)
        const keptIds = form.variants.filter(v => v.id).map(v => v.id!)
        const { data: existingVariants } = await supabase
          .from('item_variants').select('id').eq('item_id', itemId!)
        const toDelete = (existingVariants ?? [])
          .map((v: any) => v.id)
          .filter((id: string) => !keptIds.includes(id))
        if (toDelete.length > 0) {
          await supabase.from('item_variants').delete().in('id', toDelete)
          }

        for (let i = 0; i < form.variants.length; i++) {
          const v = form.variants[i]
          const variantCost = calcCost(v.ingredients, allItems)
          const variantPayload = {
            item_id: itemId!,
            name: v.name.trim(),
            price: parseFloat(v.price) || 0,
            cost: variantCost,
            sort_order: i,
          }

          let variantId = v.id
          if (v.id) {
            await supabase.from('item_variants').update(variantPayload).eq('id', v.id)
          } else {
            const { data, error } = await supabase
              .from('item_variants').insert(variantPayload).select('id').single()
            if (error) throw error
            variantId = data.id
          }

          // Replace variant ingredients
          await supabase.from('item_variant_ingredients').delete().eq('variant_id', variantId!)
          if (v.ingredients.length > 0) {
            const ingRows = v.ingredients
              .filter(ing => ing.ingredient_id && ing.quantity > 0)
              .map(ing => ({
                shop_id: shopId,
                variant_id: variantId!,
                ingredient_id: ing.ingredient_id,
                quantity: ing.quantity,
              }))
            if (ingRows.length > 0) {
              const { error: ingError } = await supabase.from('item_variant_ingredients').insert(ingRows)
              if (ingError) throw ingError
            }
          }
        }
      } else {
        // Variants turned off — delete all
        await supabase.from('item_variants').delete().eq('item_id', itemId!)
      }

      toast.success(isNew ? 'Item created' : 'Item saved')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    try {
      const { count } = await supabase
        .from('item_ingredients').select('id', { count: 'exact', head: true })
        .eq('ingredient_id', item!.id)
      if ((count ?? 0) > 0) {
        toast.error('This item is used as an ingredient in other items. Remove it from those BOMs first.')
        setConfirmDelete(false)
        setDeleting(false)
        return
      }
      await supabase.from('item_variant_ingredients').delete()
        .in('variant_id',
          (await supabase.from('item_variants').select('id').eq('item_id', item!.id)).data?.map(v => v.id) ?? []
        )
      await supabase.from('item_variants').delete().eq('item_id', item!.id)
      await supabase.from('item_ingredients').delete().eq('item_id', item!.id)
      const { error } = await supabase.from('items').delete().eq('id', item!.id)
      if (error) throw error
      toast.success('Item deleted')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete item')
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex flex-col w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'New item' : 'Edit item'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Basic info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-gray-500 mb-1.5 block">Item name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Bacon Silog" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">
                  SKU
                  {isNew && <span className="ml-1.5 text-gray-300">(auto-generated)</span>}
                </Label>
                <Input
                  value={skuLoading ? 'Generating…' : form.sku}
                  onChange={e => set('sku', e.target.value)}
                  disabled={skuLoading}
                  placeholder="e.g. SKU-0001"
                  className={skuLoading ? 'opacity-50 cursor-wait' : ''}
                />
                {isNew && !skuLoading && form.sku && (
                  <p className="text-xs text-emerald-600 mt-1">✓ You can edit this before saving</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Barcode</Label>
                <Input value={form.barcode} onChange={e => set('barcode', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-500 mb-1.5 block">Description</Label>
                <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Classification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Level</Label>
                <select value={form.level_id} onChange={e => handleLevelChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— none —</option>
                  {levels.map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.is_sellable ? ' ✓ POS' : ''}</option>
                  ))}
                </select>
                {isFinalProduct && <p className="mt-1 text-xs text-emerald-600 font-medium">✓ Visible on POS</p>}
                {form.level_id && !isFinalProduct && <p className="mt-1 text-xs text-gray-400">Not visible on POS</p>}
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Category</Label>
                <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— none —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pricing</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">
                  Price (₱){!isFinalProduct && <span className="text-gray-300 ml-1">Final Products only</span>}
                </Label>
                <Input type="number" min="0" step="0.01" value={form.price}
                  disabled={!isFinalProduct || form.has_variants}
                  onChange={e => set('price', e.target.value)}
                  className={(!isFinalProduct || form.has_variants) ? 'opacity-40 cursor-not-allowed' : ''}
                />
                {form.has_variants && (
                  <p className="text-xs text-amber-500 mt-1 font-medium">⚠ Price is set per variant</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">
                  Cost (₱){form.is_composite && <span className="text-gray-300 ml-1">auto from BOM</span>}
                </Label>
                <Input type="number" min="0" step="0.01"
                  value={form.is_composite ? bomCost.toFixed(2) : form.cost}
                  disabled={form.is_composite}
                  onChange={e => set('cost', e.target.value)}
                  className={form.is_composite ? 'opacity-40 cursor-not-allowed bg-gray-50' : ''}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Tax rate (%)</Label>
                <Input type="number" min="0" max="100" step="0.01" value={form.tax_rate}
                  onChange={e => set('tax_rate', e.target.value)} />
              </div>
            </div>
          </div>

          {/* BOM */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bill of Materials (BOM)</p>
                <p className="text-xs text-gray-400 mt-0.5">Add the ingredients that make up this item</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.is_composite ? 'On' : 'Off'}</span>
                <Switch checked={form.is_composite} onCheckedChange={v => set('is_composite', v)} />
              </div>
            </div>

            {form.is_composite && (
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                {form.ingredients.length > 0 && (
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-400 pb-2">Component</th>
                        <th className="text-right text-xs font-medium text-gray-400 pb-2">Qty</th>
                        <th className="text-right text-xs font-medium text-gray-400 pb-2">Cost</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.ingredients.map(ing => {
                        const ingItem = allItems.find(i => i.id === ing.ingredient_id)
                        const lineCost = (ingItem?.cost ?? 0) * ing.quantity
                        return (
                          <tr key={ing.ingredient_id}>
                            <td className="py-2">
                              <p className="font-medium text-gray-800">{ingItem?.name ?? '—'}</p>
                              <p className="text-xs text-gray-400">SKU: {ingItem?.sku ?? '—'}</p>
                            </td>
                            <td className="py-2 text-right">
                              <input type="number" min="0.001" step="0.001" value={ing.quantity}
                                onChange={e => updateQty(ing.ingredient_id, parseFloat(e.target.value) || 1)}
                                className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </td>
                            <td className="py-2 text-right text-gray-600 text-xs">₱{lineCost.toFixed(2)}</td>
                            <td className="py-2 pl-2">
                              <button onClick={() => removeIngredient(ing.ingredient_id)}
                                className="text-gray-300 hover:text-red-500 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-100">
                        <td colSpan={2} className="pt-2 text-right text-xs text-gray-400">Total BOM cost</td>
                        <td className="pt-2 text-right text-sm font-semibold text-gray-800">₱{bomCost.toFixed(2)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}

                <div className="relative">
                  <button onClick={() => setShowIngSearch(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    <Plus className="w-3.5 h-3.5" />Add ingredient
                  </button>
                  {showIngSearch && (
                    <div className="mt-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input autoFocus placeholder="Search by name or SKU…" value={ingSearch}
                          onChange={e => setIngSearch(e.target.value)} className="pl-8 text-sm" />
                      </div>
                      {ingSearch && (
                        <ul className="mt-1 border border-gray-100 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto">
                          {filteredIngredients.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-gray-400">No items found</li>
                          ) : filteredIngredients.map(i => (
                            <li key={i.id}>
                              <button onClick={() => addIngredient(i.id)}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                                <span>
                                  <span className="text-sm font-medium text-gray-800">{i.name}</span>
                                  {i.sku && <span className="ml-2 text-xs text-gray-400">SKU: {i.sku}</span>}
                                </span>
                                <span className="text-xs text-gray-400">₱{(i.cost ?? 0).toFixed(2)}/unit</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                {form.ingredients.length === 0 && !showIngSearch && (
                  <p className="text-xs text-gray-400 mt-2">No ingredients added yet.</p>
                )}
              </div>
            )}
          </div>

          {/* ── VARIANTS ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Variants</p>
                <p className="text-xs text-gray-400 mt-0.5">e.g. Small, Large, Spicy — each with its own BOM and price</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.has_variants ? 'On' : 'Off'}</span>
                <Switch checked={form.has_variants} onCheckedChange={v => {
                  set('has_variants', v)
                  if (v) set('price', '')
                }} />
              </div>
            </div>

            {form.has_variants && (
              <div className="space-y-3">
                {form.variants.map((v, vi) => {
                  const variantOptions = getVariantIngredientOptions(vi).filter(i =>
                    !v.ingSearch ||
                    i.name.toLowerCase().includes(v.ingSearch.toLowerCase()) ||
                    (i.sku ?? '').toLowerCase().includes(v.ingSearch.toLowerCase())
                  )

                  return (
                    <div key={vi} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Variant header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder="Variant name (e.g. Small)"
                          value={v.name}
                          onChange={e => updateVariant(vi, { name: e.target.value })}
                          className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-indigo-400 placeholder:text-gray-300"
                        />
                        <button
                          onClick={() => updateVariant(vi, { expanded: !v.expanded })}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {v.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button onClick={() => removeVariant(vi)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {v.expanded && (
                        <div className="p-4 space-y-3">
                          {/* Price + auto cost */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-gray-500 mb-1.5 block">Price (₱)</Label>
                              <Input
                                type="number" min="0" step="0.01"
                                placeholder="0.00"
                                value={v.price}
                                onChange={e => updateVariant(vi, { price: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500 mb-1.5 block">Cost (₱) <span className="text-gray-300">auto from ingredients</span></Label>
                              <Input
                                value={v.cost.toFixed(2)}
                                disabled
                                className="opacity-40 cursor-not-allowed bg-gray-50"
                              />
                            </div>
                          </div>

                          {/* Variant BOM table */}
                          {v.ingredients.length > 0 && (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left text-xs font-medium text-gray-400 pb-2">Component</th>
                                  <th className="text-right text-xs font-medium text-gray-400 pb-2">Qty</th>
                                  <th className="text-right text-xs font-medium text-gray-400 pb-2">Cost</th>
                                  <th className="w-6" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {v.ingredients.map(ing => {
                                  const ingItem = allItems.find(i => i.id === ing.ingredient_id)
                                  const lineCost = (ingItem?.cost ?? 0) * ing.quantity
                                  return (
                                    <tr key={ing.ingredient_id}>
                                      <td className="py-2">
                                        <p className="font-medium text-gray-800">{ingItem?.name ?? '—'}</p>
                                        <p className="text-xs text-gray-400">SKU: {ingItem?.sku ?? '—'}</p>
                                      </td>
                                      <td className="py-2 text-right">
                                        <input type="number" min="0.001" step="0.001" value={ing.quantity}
                                          onChange={e => updateVariantQty(vi, ing.ingredient_id, parseFloat(e.target.value) || 1)}
                                          className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                      </td>
                                      <td className="py-2 text-right text-gray-600 text-xs">₱{lineCost.toFixed(2)}</td>
                                      <td className="py-2 pl-2">
                                        <button onClick={() => removeVariantIngredient(vi, ing.ingredient_id)}
                                          className="text-gray-300 hover:text-red-500 transition-colors">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-gray-100">
                                  <td colSpan={2} className="pt-2 text-right text-xs text-gray-400">Total cost</td>
                                  <td className="pt-2 text-right text-sm font-semibold text-gray-800">₱{v.cost.toFixed(2)}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          )}

                          {/* Add ingredient to variant */}
                          <div className="relative">
                            <button
                              onClick={() => updateVariant(vi, { showIngSearch: !v.showIngSearch })}
                              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              <Plus className="w-3.5 h-3.5" />Add ingredient
                            </button>
                            {v.showIngSearch && (
                              <div className="mt-2">
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                  <Input autoFocus placeholder="Search by name or SKU…" value={v.ingSearch}
                                    onChange={e => updateVariant(vi, { ingSearch: e.target.value })}
                                    className="pl-8 text-sm" />
                                </div>
                                {v.ingSearch && (
                                  <ul className="mt-1 border border-gray-100 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto">
                                    {variantOptions.length === 0 ? (
                                      <li className="px-3 py-2 text-xs text-gray-400">No items found</li>
                                    ) : variantOptions.map(i => (
                                      <li key={i.id}>
                                        <button onClick={() => addVariantIngredient(vi, i.id)}
                                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                                          <span>
                                            <span className="text-sm font-medium text-gray-800">{i.name}</span>
                                            {i.sku && <span className="ml-2 text-xs text-gray-400">SKU: {i.sku}</span>}
                                          </span>
                                          <span className="text-xs text-gray-400">₱{(i.cost ?? 0).toFixed(2)}/unit</span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            {v.ingredients.length === 0 && !v.showIngSearch && (
                              <p className="text-xs text-gray-400 mt-2">No ingredients added yet.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <button
                  onClick={addVariant}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create variant
                </button>
              </div>
            )}
          </div>

          {/* Add-Ons */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Offer Add-Ons</p>
                <p className="text-xs text-gray-400 mt-0.5">Show optional add-on items on POS when ordering</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.offer_addons ? 'On' : 'Off'}</span>
                <Switch checked={form.offer_addons} onCheckedChange={v => {
                  set('offer_addons', v)
                  if (!v) set('addon_category_id', '')
                }} />
              </div>
            </div>
            {form.offer_addons && (
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                <Label className="text-xs text-gray-500 mb-1.5 block">Add-On Category</Label>
                <select
                  value={form.addon_category_id}
                  onChange={e => set('addon_category_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">— select a category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!form.addon_category_id && (
                  <p className="text-xs text-amber-500 mt-1.5">⚠ Select a category to define which add-ons appear on POS</p>
                )}
                {form.addon_category_id && (
                  <p className="text-xs text-emerald-600 mt-1.5">✓ Add-ons will be pulled from this category on POS</p>
                )}
              </div>
            )}
          </div>

          {/* Settings */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Settings</p>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
              {([
                { key: 'is_active' as const, label: 'Active', sub: 'Item is available for sale' },
                { key: 'track_stock' as const, label: 'Track stock', sub: 'Monitor and alert on inventory levels' },
                { key: 'sold_by_weight' as const, label: 'Sold by weight/volume', sub: 'Price is calculated per unit weight' },
              ] as const).map(({ key, label, sub }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                  <Switch checked={form[key] as boolean} onCheckedChange={v => set(key, v)} />
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white rounded-b-2xl shrink-0">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
              </Button>
            )
          )}
          <div className={`flex items-center gap-2 ${isNew ? 'ml-auto' : ''}`}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
