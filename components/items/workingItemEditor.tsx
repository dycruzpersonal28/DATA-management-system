'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { X, Trash2, Plus, Search, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import type { Item, ItemLevel, Category, ItemIngredient } from '@/lib/types/database'

type Props = {
  item: Item | null          // null = new item
  allItems: Item[]
  levels: ItemLevel[]
  categories: Category[]
  shopId: string
  onClose: () => void
  onSaved: () => void
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
  is_active: boolean
  track_stock: boolean
  sold_by_weight: boolean
  tax_rate: string
  ingredients: { ingredient_id: string; quantity: number }[]
}

function calcBomCost(
  ingredients: { ingredient_id: string; quantity: number }[],
  allItems: Item[]
): number {
  return ingredients.reduce((sum, ing) => {
    const found = allItems.find(i => i.id === ing.ingredient_id)
    return sum + (found ? (found.cost ?? 0) * ing.quantity : 0)
  }, 0)
}

export default function ItemEditor({ item, allItems, levels, categories, shopId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const isNew = !item
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ingSearch, setIngSearch] = useState('')
  const [showIngSearch, setShowIngSearch] = useState(false)

  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    price: '',
    cost: '',
    category_id: '',
    level_id: '',
    is_composite: false,
    is_active: true,
    track_stock: false,
    sold_by_weight: false,
    tax_rate: '0',
    ingredients: [],
  })

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? '',
        sku: item.sku ?? '',
        barcode: item.barcode ?? '',
        price: item.price ? String(item.price) : '',
        cost: item.cost ? String(item.cost) : '',
        category_id: item.category_id ?? '',
        level_id: item.level_id ?? '',
        is_composite: item.is_composite ?? false,
        is_active: item.is_active,
        track_stock: item.track_stock,
        sold_by_weight: item.sold_by_weight,
        tax_rate: String(item.tax_rate ?? 0),
        ingredients: (item.ingredients ?? []).map(i => ({
          ingredient_id: i.ingredient_id,
          quantity: i.quantity,
        })),
      })
    }
  }, [item])

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const currentLevel = levels.find(l => l.id === form.level_id)
  const isFinalProduct = currentLevel?.is_sellable ?? false
  const bomCost = calcBomCost(form.ingredients, allItems)

  function handleLevelChange(levelId: string) {
    set('level_id', levelId)
    const level = levels.find(l => l.id === levelId)
    if (!level?.is_sellable) set('price', '')
  }

  // ── ingredients ────────────────────────────────────────────────────────────
  const usedIds = new Set(form.ingredients.map(i => i.ingredient_id))
  const availableIngredients = allItems.filter(
    i => i.id !== item?.id && !usedIds.has(i.id)
  )
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

  // ── save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) { toast.error('Item name is required'); return }
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
        is_active: form.is_active,
        track_stock: form.track_stock,
        sold_by_weight: form.sold_by_weight,
        tax_rate: parseFloat(form.tax_rate) || 0,
        updated_at: new Date().toISOString(),
      }

      let itemId = item?.id

      if (isNew) {
        const { data, error } = await supabase
          .from('items')
          .insert({ ...payload, shop_id: shopId })
          .select('id')
          .single()
        if (error) throw error
        itemId = data.id
      } else {
        const { error } = await supabase
          .from('items')
          .update(payload)
          .eq('id', item!.id)
        if (error) throw error
      }

      // replace BOM ingredients
      await supabase.from('item_ingredients').delete().eq('item_id', itemId!)
      if (form.is_composite && form.ingredients.length > 0) {
        const rows = form.ingredients
          .filter(i => i.ingredient_id && i.quantity > 0)
          .map(i => ({
            shop_id: shopId,
            item_id: itemId!,
            ingredient_id: i.ingredient_id,
            quantity: i.quantity,
          }))
        if (rows.length > 0) {
          const { error } = await supabase.from('item_ingredients').insert(rows)
          if (error) throw error
        }
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

  // ── delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    try {
      // block delete if used as ingredient elsewhere
      const { count } = await supabase
        .from('item_ingredients')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', item!.id)
      if ((count ?? 0) > 0) {
        toast.error('This item is used as an ingredient in other items. Remove it from those BOMs first.')
        setConfirmDelete(false)
        setDeleting(false)
        return
      }
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

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-100">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'New item' : 'Edit item'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Basic info ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-gray-500 mb-1.5 block">Item name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Bacon Silog" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">SKU</Label>
                <Input value={form.sku} onChange={e => set('sku', e.target.value)} />
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

          {/* ── Classification ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Classification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Level</Label>
                <select
                  value={form.level_id}
                  onChange={e => handleLevelChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— none —</option>
                  {levels.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.is_sellable ? ' ✓ POS' : ''}
                    </option>
                  ))}
                </select>
                {isFinalProduct && (
                  <p className="mt-1 text-xs text-emerald-600 font-medium">✓ Visible on POS</p>
                )}
                {form.level_id && !isFinalProduct && (
                  <p className="mt-1 text-xs text-gray-400">Not visible on POS</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Category</Label>
                <select
                  value={form.category_id}
                  onChange={e => set('category_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— none —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Pricing ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pricing</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">
                  Price (₱){!isFinalProduct && <span className="text-gray-300 ml-1">Final Products only</span>}
                </Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.price}
                  disabled={!isFinalProduct}
                  onChange={e => set('price', e.target.value)}
                  className={!isFinalProduct ? 'opacity-40 cursor-not-allowed' : ''}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">
                  Cost (₱){form.is_composite && <span className="text-gray-300 ml-1">auto from BOM</span>}
                </Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.is_composite ? bomCost.toFixed(2) : form.cost}
                  disabled={form.is_composite}
                  onChange={e => set('cost', e.target.value)}
                  className={form.is_composite ? 'opacity-40 cursor-not-allowed bg-gray-50' : ''}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1.5 block">Tax rate (%)</Label>
                <Input
                  type="number" min="0" max="100" step="0.01"
                  value={form.tax_rate}
                  onChange={e => set('tax_rate', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── BOM / Composite ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bill of Materials (BOM)</p>
                <p className="text-xs text-gray-400 mt-0.5">Add the ingredients that make up this item</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.is_composite ? 'On' : 'Off'}</span>
                <Switch
                  checked={form.is_composite}
                  onCheckedChange={v => set('is_composite', v)}
                />
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
                              <input
                                type="number" min="0.001" step="0.001"
                                value={ing.quantity}
                                onChange={e => updateQty(ing.ingredient_id, parseFloat(e.target.value) || 1)}
                                className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 text-right text-gray-600 text-xs">₱{lineCost.toFixed(2)}</td>
                            <td className="py-2 pl-2">
                              <button
                                onClick={() => removeIngredient(ing.ingredient_id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                              >
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

                {/* ingredient search */}
                <div className="relative">
                  <button
                    onClick={() => setShowIngSearch(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add ingredient
                  </button>
                  {showIngSearch && (
                    <div className="mt-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input
                          autoFocus
                          placeholder="Search by name or SKU…"
                          value={ingSearch}
                          onChange={e => setIngSearch(e.target.value)}
                          className="pl-8 text-sm"
                        />
                      </div>
                      {ingSearch && (
                        <ul className="mt-1 border border-gray-100 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto">
                          {filteredIngredients.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-gray-400">No items found</li>
                          ) : filteredIngredients.map(i => (
                            <li key={i.id}>
                              <button
                                onClick={() => addIngredient(i.id)}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
                              >
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

          {/* ── Settings toggles ── */}
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

        {/* footer */}
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
              <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
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
