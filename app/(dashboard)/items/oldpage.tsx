'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Pencil, Package, Trash2, Upload, Download } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ItemsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadItems() {
    const { data: cats } = await supabase.from('categories').select('*').order('name')
    setCategories(cats || [])
    const { data } = await supabase
      .from('items')
      .select('*, categories(name, color), inventory_levels(quantity, low_stock_alert)')
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [])

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter ? i.category_id === catFilter : true
    const qty = i.inventory_levels?.[0]?.quantity ?? null
    const alert = i.inventory_levels?.[0]?.low_stock_alert ?? 0
    const matchStock = stockFilter === 'low' ? (qty !== null && qty <= alert) :
                       stockFilter === 'out' ? qty === 0 : true
    return matchSearch && matchCat && matchStock
  })

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

  async function handleDelete() {
    if (!confirm(`Delete ${selected.size} item(s)?`)) return
    await supabase.from('items').delete().in('id', [...selected])
    toast.success(`${selected.size} item(s) deleted`)
    setSelected(new Set())
    loadItems()
  }

  function handleExport() {
    const rows = filtered.map(i => [
      i.name, i.categories?.name || '', i.price, i.cost || 0,
      i.sku || '', i.barcode || '', i.is_active ? 'Active' : 'Inactive'
    ])
    const csv = [['Name','Category','Price','Cost','SKU','Barcode','Status'], ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'items.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported items.csv')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return
    let imported = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
      const [name, , price, cost, sku, barcode] = cols
      if (!name || !price) continue
      await supabase.from('items').insert({
        shop_id: shop.id, name, price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0, sku: sku || null,
        barcode: barcode || null, is_active: true
      })
      imported++
    }
    toast.success(`Imported ${imported} items`)
    loadItems()
    e.target.value = ''
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Link href="/items/new">
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" />Add Item</Button>
          </Link>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" />Import File
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1.5" />Export
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No items found</p>
            <Link href="/items/new"><Button className="mt-4" variant="outline"><Plus className="w-4 h-4 mr-2" />Add item</Button></Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Category</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Price</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => (
                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selected.has(item.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {item.categories ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: item.categories.color }}>
                        {item.categories.name}
                      </span>
                    ) : <span className="text-xs text-gray-400">No category</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">${Number(item.price).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={item.is_active ? 'default' : 'secondary'}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/items/${item.id}`}>
                      <button className="text-gray-400 hover:text-indigo-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
