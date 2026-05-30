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
  const [editingItem, setEditingItem] = useState<Item | null | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  async function loadData() {
    setLoading(true)
    try {
      // ── shop ──────────────────────────────────────────────────────────────
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) { setLoading(false); return }
      setShopId(shop.id)

      // ── levels ────────────────────────────────────────────────────────────
      const { data: lvls } = await supabase
        .from('item_levels')
        .select('*')
        .eq('shop_id', shop.id)
        .order('sort_order')
      setLevels(lvls ?? [])

      // ── categories ────────────────────────────────────────────────────────
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('shop_id', shop.id)
        .order('name')
      setCategories(cats ?? [])

      // ── items — same simple select as POS, plus level join ────────────────
      const { data: rawItems, error: itemsErr } = await supabase
        .from('items')
        .select('*, categories!items_category_id_fkey(id, name, color), level:item_levels(id, name, sort_order, is_sellable)')
        .eq('shop_id', shop.id)
        .order('name')
      if (itemsErr) { console.error('[items] error:', itemsErr); setLoading(false); return }

      // ── ingredients — separate query, no ambiguous FK ─────────────────────
      const { data: ings } = await supabase
        .from('item_ingredients')
        .select('id, item_id, ingredient_id, quantity')
        .eq('shop_id', shop.id)

      // build a lookup: item_id → ingredients[]
      const ingMap: Record<string, any[]> = {}
      if (ings) {
        for (const ing of ings) {
          if (!ingMap[ing.item_id]) ingMap[ing.item_id] = []
          ingMap[ing.item_id].push(ing)
        }
      }

      // attach ingredients + resolve ingredient details from rawItems
      const itemsById: Record<string, any> = {}
      for (const item of rawItems ?? []) itemsById[item.id] = item

      const enriched = (rawItems ?? []).map(item => ({
        ...item,
        ingredients: (ingMap[item.id] ?? []).map(ing => ({
          ...ing,
          ingredient: itemsById[ing.ingredient_id] ?? null,
        })),
      }))

      setItems(enriched as Item[])
    } catch (e) {
      console.error('[items] loadData threw:', e)
    } finally {
      setLoading(false)
    }
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
    const ids = [...selected]
    try {
      // Get variant IDs first so we can delete their ingredients
      const { data: variants } = await supabase
        .from('item_variants').select('id').in('item_id', ids)
      const variantIds = (variants ?? []).map((v: any) => v.id)

      // Delete in order: deepest children first
      if (variantIds.length > 0) {
        await supabase.from('item_variant_ingredients').delete().in('variant_id', variantIds)
      }
      await supabase.from('item_variants').delete().in('item_id', ids)
      await supabase.from('item_ingredients').delete().in('item_id', ids)
      const { error } = await supabase.from('items').delete().in('id', ids)
      if (error) throw error

      toast.success(`${selected.size} item(s) deleted`)
      setSelected(new Set())
      loadData()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete items')
    }
  }

  // ── export — full raw format (matches Supabase export, safe to re-import) ──
  function handleExport() {
    const headers = [
      'id', 'shop_id', 'name', 'description', 'sku', 'barcode',
      'category', 'level', 'addon_category',
      'category_id', 'level_id', 'price', 'cost', 'tax_rate',
      'is_active', 'is_composite', 'has_variants', 'track_stock',
      'sold_by_weight', 'offer_addons', 'addon_category_id',
    ]
    const rows = filtered.map(i => [
      i.id,
      (i as any).shop_id ?? shopId,
      i.name,
      i.description ?? '',
      i.sku ?? '',
      i.barcode ?? '',
      (i as any).categories?.name ?? '',
      (i as any).level?.name ?? '',
      categories.find(c => c.id === (i as any).addon_category_id)?.name ?? '',
      i.category_id ?? '',
      i.level_id ?? '',
      i.price ?? 0,
      i.cost ?? 0,
      (i as any).tax_rate ?? 0,
      i.is_active,
      i.is_composite,
      (i as any).has_variants ?? false,
      i.track_stock,
      i.sold_by_weight,
      (i as any).offer_addons ?? false,
      (i as any).addon_category_id ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'items_export.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported items_export.csv — safe to re-import')
  }

  // ── import ─────────────────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !shopId) return

    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) { toast.error('CSV is empty'); return }

    // Parse header row to detect format
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
    const isRawExport = headers.includes('shop_id') // Supabase raw export

    // Build category & level name→id maps (used for both friendly and raw formats)
    const catByName: Record<string, string> = {}
    const levelByName: Record<string, string> = {}
    categories.forEach(c => { catByName[c.name.toLowerCase()] = c.id })
    levels.forEach(l => { levelByName[l.name.toLowerCase()] = l.id })

    let imported = 0
    let skipped = 0
    const toInsert: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      const get = (key: string) => {
        const idx = headers.indexOf(key)
        return idx >= 0 ? (cols[idx] ?? '').trim() : ''
      }

      if (isRawExport) {
        // ── Raw Supabase export format ──
        const name = get('name')
        if (!name) { skipped++; continue }
        const row: any = {
          shop_id: shopId,
          name,
          price: parseFloat(get('price')) || 0,
          cost: parseFloat(get('cost')) || 0,
          sku: get('sku') || null,
          barcode: get('barcode') || null,
          description: get('description') || null,
          track_stock: get('track_stock') === 'true',
          is_active: get('is_active') !== 'false',
          is_composite: get('is_composite') === 'true',
          has_variants: get('has_variants') === 'true',
          available_for_sale: get('available_for_sale') !== 'false',
          offer_addons: get('offer_addons') === 'true',
          sold_by_weight: get('sold_by_weight') === 'true',
          tax_rate: parseFloat(get('tax_rate')) || 0,
        }
        // Keep IDs if present, fallback to name lookup if UUID missing
        const id = get('id'); if (id) row.id = id
        const catId = get('category_id')
        const catName = get('category')
        if (catId) row.category_id = catId
        else if (catName) row.category_id = catByName[catName.toLowerCase()] || null
        const levelId = get('level_id')
        const levelName = get('level')
        if (levelId) row.level_id = levelId
        else if (levelName) row.level_id = levelByName[levelName.toLowerCase()] || null
        const addonCatId = get('addon_category_id')
        const addonCatName = get('addon_category')
        if (addonCatId) row.addon_category_id = addonCatId
        else if (addonCatName) row.addon_category_id = catByName[addonCatName.toLowerCase()] || null
        toInsert.push(row)
      } else {
        // ── Friendly CSV format (Name, Category, Level, Price, Cost, SKU, Barcode, Status, Composite, Track Stock) ──
        const name = get('name')
        if (!name) { skipped++; continue }
        const catName = get('category')
        const levelName = get('level')
        toInsert.push({
          shop_id: shopId,
          name,
          category_id: catByName[catName.toLowerCase()] || null,
          level_id: levelByName[levelName.toLowerCase()] || null,
          price: parseFloat(get('price')) || 0,
          cost: parseFloat(get('cost')) || 0,
          sku: get('sku') || null,
          barcode: get('barcode') || null,
          is_active: get('status')?.toLowerCase() !== 'inactive',
          is_composite: get('composite')?.toLowerCase() === 'yes',
          track_stock: get('track_stock')?.toLowerCase() === 'yes' || get('track_stock') === 'true',
        })
      }
      imported++
    }

    if (toInsert.length === 0) { toast.error('No valid rows found'); return }

    // Insert in batches of 100
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      const { error } = await supabase.from('items').upsert(batch, { onConflict: 'id' })
      if (error) { toast.error(`Import error: ${error.message}`); break }
      inserted += batch.length
    }

    toast.success(`Imported ${inserted} items${skipped > 0 ? `, skipped ${skipped}` : ''}`)
    loadData()
    e.target.value = ''
  }


  // ── level badge ────────────────────────────────────────────────────────────
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

      {/* category summary */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div
            onClick={() => setCatFilter('')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${catFilter === '' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
          >
            <span className="text-xs font-medium text-gray-600">All</span>
            <span className="text-xs font-bold text-gray-800">{items.length}</span>
          </div>
          {categories.map(c => {
            const count = items.filter(i => i.category_id === c.id).length
            if (count === 0) return null
            return (
              <div
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${catFilter === c.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-xs font-medium text-gray-600">{c.name}</span>
                <span className="text-xs font-bold text-gray-800">{count}</span>
              </div>
            )
          })}
          {items.filter(i => !i.category_id).length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 bg-gray-50">
              <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              <span className="text-xs font-medium text-gray-400">Uncategorized</span>
              <span className="text-xs font-bold text-gray-500">{items.filter(i => !i.category_id).length}</span>
            </div>
          )}
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
          <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: `${rowsPerPage * 57}px` }}>
            <table className="w-full min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 w-8 bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[160px]">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[110px]">Level</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[110px]">Category</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[80px]">Price</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[90px]">Cost</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[50px]">POS</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[50px]">BOM</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 bg-gray-50 min-w-[80px]">Status</th>
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
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{filtered.length} of {items.length} items</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={e => setRowsPerPage(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[10, 25, 50, 100].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

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
