'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Package, Trash2, Upload, Download, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import ItemEditor from '@/components/items/ItemEditor'
import type { Item, ItemLevel, Category } from '@/lib/types/database'

export default function ItemsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Item[]>([])
  const [levels, setLevels] = useState<ItemLevel[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [shopId, setShopId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState<Item | null | undefined>(undefined) // undefined = closed, null = new
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadData() {
    // get shop
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (shop) setShopId(shop.id)

    // load levels
    const { data: lvls } = await supabase
      .from('item_levels')
      .select('*')
      .eq('shop_id', shop?.id)
      .order('sort_order')
    setLevels(lvls ?? [])

    // load categories
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('shop_id', shop?.id)
      .order('name')
    setCategories(cats ?? [])

    // load items with joins
    const { data } = await supabase
      .from('items')
      .select(`
        *,
        categories(id, name, color),
        level:item_levels(id, name, sort_order, is_sellable),
        inventory_levels(quantity, low_stock_alert),
        ingredients:item_ingredients(
          id, ingredient_id, quantity,
          ingredient:items!item_ingredients_ingredient_id_fkey(id, name, sku, cost)
        )
      `)
      .eq('shop_id', shop?.id)
      .order('name')
    setItems((data as Item[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── filters ────────────────────────────────────────────────────────────────
  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? '').toLowerCase().includes(search.toLowerCase())
    const matchLevel = levelFilter ? i.level_id === levelFilter : true
    const matchCat = catFilter ? i.category_id === catFilter : true
    return matchSearch && matchLevel && matchCat
  })

  // ── selection ──────────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.id)))
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} item(s)?`)) return
    await supabase.from('item_ingredients').delete().in('item_id', [...selected])
    await supabase.from('items').delete().in('id', [...selected])
    toast.success(`${selected.size} item(s) deleted`)
    setSelected(new Set())
    loadData()
  }

  // ── export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = filtered.map(i => [
      i.name,
      (i as any).categories?.name || '',
      (i as any).level?.name || '',
      i.price,
      i.cost || 0,
      i.sku || '',
      i.barcode || '',
      i.is_active ? 'Active' : 'Inactive',
      i.is_composite ? 'Yes' : 'No',
    ])
    const csv = [
      ['Name', 'Category', 'Level', 'Price', 'Cost', 'SKU', 'Barcode', 'Status', 'Composite'],
      ...rows,
    ].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'items.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported items.csv')
  }

  // ── import ─────────────────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (!shopId) return
    let imported = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
      const [name, , , price, cost, sku, barcode] = cols
      if (!name || !price) continue
      await supabase.from('items').insert({
        shop_id: shopId, name,
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        sku: sku || null,
        barcode: barcode || null,
        is_active: true,
        is_composite: false,
      })
      imported++
    }
    toast.success(`Imported ${imported} items`)
    loadData()
    e.target.value = ''
  }

  // ── level badge helper ─────────────────────────────────────────────────────
  function LevelBadge({ item }: { item: Item }) {
    const level = (item as any).level as ItemLevel | undefined
    if (!level) return <span className="text-xs text-gray-300">—</span>
    const colorMap: Record<string, string> = {
      'Final Product': 'bg-emerald-100 text-emerald-700',
      'Level 2': 'bg-blue-100 text-blue-700',
      'Level 1': 'bg-amber-100 text-amber-700',
      'Raw': 'bg-gray-100 text-gray-600',
    }
    const cls = colorMap[level.name] ?? 'bg-gray-100 text-gray-600'
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        {level.is_sellable && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
        {level.name}
      </span>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setEditingItem(null)}>
            <Plus className="w-4 h-4 mr-1.5" />Add Item
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" />Import
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1.5" />Export
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
            </Button>
          )}
        </div>

        {/* filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Levels</option>
            {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
        </div>
      </div>

      {/* level legend */}
      {levels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {levels.map(l => (
            <div key={l.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-lg">
              <span className={`w-1.5 h-1.5 rounded-full ${l.is_sellable ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">{l.name}</span>
              {l.is_sellable && <span className="text-xs text-emerald-500 font-medium">· POS</span>}
            </div>
          ))}
        </div>
      )}

      {/* table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No items found</p>
            <Button className="mt-4" variant="outline" onClick={() => setEditingItem(null)}>
              <Plus className="w-4 h-4 mr-2" />Add item
            </Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Level</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Category</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Price</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Cost</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">POS</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">BOM</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => {
                const level = (item as any).level as ItemLevel | undefined
                const bomCost = (item.ingredients ?? []).reduce((s: number, ing: any) => {
                  return s + ((ing.ingredient?.cost ?? 0) * ing.quantity)
                }, 0)
                const displayCost = item.is_composite ? bomCost : (item.cost ?? 0)

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(item.id) ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3" onClick={() => setEditingItem(item)}>
                      <p className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">{item.name}</p>
                      {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                    </td>
                    <td className="px-4 py-3" onClick={() => setEditingItem(item)}>
                      <LevelBadge item={item} />
                    </td>
                    <td className="px-4 py-3" onClick={() => setEditingItem(item)}>
                      {(item as any).categories ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: (item as any).categories.color }}
                        >
                          {(item as any).categories.name}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={() => setEditingItem(item)}>
                      {level?.is_sellable && item.price
                        ? <span className="text-sm font-semibold text-gray-900">₱{Number(item.price).toFixed(2)}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={() => setEditingItem(item)}>
                      <span className="text-sm text-gray-600">
                        ₱{displayCost.toFixed(2)}
                        {item.is_composite && <span className="text-xs text-gray-400 ml-1">(BOM)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={() => setEditingItem(item)}>
                      {level?.is_sellable
                        ? <span className="text-emerald-500 font-semibold text-sm">✓</span>
                        : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={() => setEditingItem(item)}>
                      {item.is_composite
                        ? <GitBranch className="w-3.5 h-3.5 text-indigo-400 mx-auto" />
                        : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={() => setEditingItem(item)}>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">{filtered.length} of {items.length} items</p>

      {/* editor modal */}
      {editingItem !== undefined && (
        <ItemEditor
          item={editingItem}
          allItems={items}
          levels={levels}
          categories={categories}
          shopId={shopId}
          onClose={() => setEditingItem(undefined)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}
