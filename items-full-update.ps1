# ============================================================
# ITEMS FULL UPDATE - Sidebar + All Submenus
# Run from your project root in PowerShell
# ============================================================

New-Item -ItemType Directory -Force -Path "app/(dashboard)/categories" | Out-Null
New-Item -ItemType Directory -Force -Path "app/(dashboard)/modifiers" | Out-Null
New-Item -ItemType Directory -Force -Path "app/(dashboard)/ingredients" | Out-Null

# ============================================================
# SIDEBAR
# ============================================================
Set-Content -Path "components/shared/Sidebar.tsx" -Encoding UTF8 -Value @'
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog,
  BarChart2, Settings, LogOut, Monitor, ChevronDown, ChevronRight,
  List, Tag, Sliders, FlaskConical
} from 'lucide-react'
import { toast } from 'sonner'

const itemsSubmenu = [
  { label: 'Item List',    href: '/items',       icon: List },
  { label: 'Categories',   href: '/categories',  icon: Tag },
  { label: 'Modifiers',    href: '/modifiers',   icon: Sliders },
  { label: 'Ingredients',  href: '/ingredients', icon: FlaskConical },
]

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'POS',       href: '/pos',        icon: ShoppingCart },
  { label: 'Inventory', href: '/inventory',  icon: Package },
  { label: 'Customers', href: '/customers',  icon: Users },
  { label: 'Employees', href: '/employees',  icon: UserCog },
  { label: 'Reports',   href: '/reports',    icon: BarChart2 },
  { label: 'Settings',  href: '/settings',   icon: Settings },
]

const itemsPaths = ['/items', '/categories', '/modifiers', '/ingredients']

export default function Sidebar({ shop }: { shop: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isItemsActive = itemsPaths.some(p => pathname.startsWith(p))
  const [itemsOpen, setItemsOpen] = useState(isItemsActive)

  useEffect(() => {
    if (!isItemsActive) setItemsOpen(false)
    else setItemsOpen(true)
  }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    toast.success('Signed out')
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{shop?.name}</p>
            <p className="text-xs text-gray-400">Back Office</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <Link href="/dashboard" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />Dashboard
        </Link>

        <Link href="/pos" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/pos' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <ShoppingCart className="w-4 h-4 flex-shrink-0" />POS
        </Link>

        {/* Items with submenu */}
        <div>
          <button
            onClick={() => setItemsOpen(prev => !prev)}
            className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors', isItemsActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
          >
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 flex-shrink-0" />Items
            </div>
            {itemsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {itemsOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
              {itemsSubmenu.map(sub => {
                const Icon = sub.icon
                const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <Link key={sub.href} href={sub.href}
                    className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />{sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />{item.label}
            </Link>
          )
        })}
      </nav>

      {shop?.kds_enabled && (
        <div className="px-3 pb-2">
          <Link href="/kds" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Monitor className="w-4 h-4" />Kitchen Display
          </Link>
        </div>
      )}

      <div className="p-3 border-t border-gray-100">
        <button onClick={handleSignOut} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 w-full transition-colors">
          <LogOut className="w-4 h-4" />Sign out
        </button>
      </div>
    </aside>
  )
}
'@

# ============================================================
# ITEM LIST PAGE
# ============================================================
Set-Content -Path "app/(dashboard)/items/page.tsx" -Encoding UTF8 -Value @'
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
'@

# ============================================================
# CATEGORIES PAGE
# ============================================================
Set-Content -Path "app/(dashboard)/categories/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ef4444','#eab308','#06b6d4','#ec4899','#64748b','#10b981']

export default function CategoriesPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [editing, setEditing] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return
    const { data } = await supabase.from('categories').select('*').eq('shop_id', shop.id).order('sort_order')
    setCategories(data || [])
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return

    if (editing) {
      await supabase.from('categories').update({ name, color }).eq('id', editing.id)
      toast.success('Category updated')
    } else {
      await supabase.from('categories').insert({ shop_id: shop.id, name, color, sort_order: categories.length })
      toast.success('Category added')
    }
    setName(''); setColor(COLORS[0]); setEditing(null); setShowForm(false); setLoading(false); load()
  }

  async function handleDelete() {
    if (!confirm(`Delete ${selected.size} category/categories?`)) return
    await supabase.from('categories').delete().in('id', [...selected])
    toast.success('Deleted'); setSelected(new Set()); load()
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === categories.length) setSelected(new Set())
    else setSelected(new Set(categories.map(c => c.id)))
  }

  function startEdit(cat: any) {
    setEditing(cat); setName(cat.name); setColor(cat.color); setShowForm(true)
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">Organize your items into categories</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setEditing(null); setName(''); setColor(COLORS[0]); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-1.5" />Add Category
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
          </Button>
        )}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{editing ? 'Edit category' : 'New category'}</h2>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Category name" />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: color === c ? '#111' : 'transparent', transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading}>{editing ? 'Update' : 'Add'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setName(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No categories yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === categories.length && categories.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Color</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map(cat => (
                <tr key={cat.id} className={`hover:bg-gray-50 ${selected.has(cat.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(cat.id)} onChange={() => toggleSelect(cat.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-3 py-0.5 rounded-full text-xs text-white font-medium" style={{ backgroundColor: cat.color }}>{cat.color}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(cat)} className="text-gray-400 hover:text-indigo-600">
                      <Pencil className="w-4 h-4" />
                    </button>
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
'@

# ============================================================
# MODIFIERS PAGE
# ============================================================
Set-Content -Path "app/(dashboard)/modifiers/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ModifiersPage() {
  const supabase = createClient()
  const [modifiers, setModifiers] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [name, setName] = useState('')
  const [options, setOptions] = useState([{ name: '', price: '' }])
  const [loading, setLoading] = useState(false)

  async function load() {
    const { data } = await supabase.from('modifiers').select('*').order('created_at', { ascending: false })
    setModifiers(data || [])
  }

  useEffect(() => { load() }, [])

  function addOption() { setOptions(prev => [...prev, { name: '', price: '' }]) }
  function removeOption(i: number) { setOptions(prev => prev.filter((_, idx) => idx !== i)) }
  function updateOption(i: number, field: string, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: val } : o))
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return

    const payload = {
      shop_id: shop.id,
      name,
      options: options.filter(o => o.name).map(o => ({ name: o.name, price: parseFloat(o.price) || 0 }))
    }

    if (editing) {
      await supabase.from('modifiers').update(payload).eq('id', editing.id)
      toast.success('Modifier updated')
    } else {
      await supabase.from('modifiers').insert(payload)
      toast.success('Modifier created')
    }
    setName(''); setOptions([{ name: '', price: '' }]); setEditing(null); setShowForm(false); setLoading(false); load()
  }

  async function handleDelete() {
    if (!confirm(`Delete ${selected.size} modifier(s)?`)) return
    await supabase.from('modifiers').delete().in('id', [...selected])
    toast.success('Deleted'); setSelected(new Set()); load()
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === modifiers.length) setSelected(new Set())
    else setSelected(new Set(modifiers.map(m => m.id)))
  }

  function startEdit(mod: any) {
    setEditing(mod); setName(mod.name)
    setOptions(mod.options?.length ? mod.options.map((o: any) => ({ name: o.name, price: String(o.price) })) : [{ name: '', price: '' }])
    setShowForm(true)
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Modifiers</h1>
        <p className="text-sm text-gray-500 mt-1">Create modifier groups like size, toppings, extras</p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setEditing(null); setName(''); setOptions([{ name: '', price: '' }]); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-1.5" />Add Modifier
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{editing ? 'Edit modifier' : 'New modifier'}</h2>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Modifier name (e.g. Size, Toppings)" />
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Options</p>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={opt.name} onChange={e => updateOption(i, 'name', e.target.value)} placeholder="Option name" className="flex-1" />
                <Input value={opt.price} onChange={e => updateOption(i, 'price', e.target.value)} placeholder="Price" type="number" className="w-24" />
                {options.length > 1 && (
                  <button onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addOption}><Plus className="w-3 h-3 mr-1" />Add option</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading}>{editing ? 'Update' : 'Create'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {modifiers.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No modifiers yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === modifiers.length && modifiers.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Options</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {modifiers.map(mod => (
                <tr key={mod.id} className={`hover:bg-gray-50 ${selected.has(mod.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(mod.id)} onChange={() => toggleSelect(mod.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{mod.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(mod.options || []).map((o: any, i: number) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {o.name}{o.price > 0 ? ` +$${o.price.toFixed(2)}` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(mod)} className="text-gray-400 hover:text-indigo-600">
                      <Pencil className="w-4 h-4" />
                    </button>
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
'@

# ============================================================
# INGREDIENTS / BOM PAGE
# ============================================================
Set-Content -Path "app/(dashboard)/ingredients/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Search, ChevronDown, ChevronRight, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

interface Level { id: string; name: string; order_index: number; description: string }
interface Product { id: string; name: string; code: string; level_id: string; unit: string; cost_price: number; sell_price: number; stock_quantity: number; is_active: boolean; product_levels?: { name: string } }
interface Ingredient { id: string; ingredient_id: string; quantity: number; products?: { id: string; name: string; unit: string; code: string } }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function BOMEditor({ product, allProducts, onClose }: { product: Product; allProducts: Product[]; onClose: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selId, setSelId] = useState('')
  const [qty, setQty] = useState('1')
  const [loading, setLoading] = useState(true)

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from('product_ingredients')
      .select('*, products:ingredient_id(id, name, unit, code)')
      .eq('product_id', product.id)
    setIngredients(data || [])
    setLoading(false)
  }, [product.id])

  useEffect(() => { fetchIngredients() }, [fetchIngredients])

  const available = allProducts.filter(p => p.id !== product.id && !ingredients.find(i => i.ingredient_id === p.id))

  async function addIngredient() {
    if (!selId || !qty) return
    const { error } = await supabase.from('product_ingredients').insert({ product_id: product.id, ingredient_id: selId, quantity: parseFloat(qty) })
    if (error) { toast.error(error.message); return }
    toast.success('Ingredient added')
    setSelId(''); setQty('1'); fetchIngredients()
  }

  async function removeIngredient(id: string) {
    await supabase.from('product_ingredients').delete().eq('id', id)
    fetchIngredients()
  }

  return (
    <Modal title={`BOM: ${product.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500">Define what <strong>{product.name}</strong> is made of. Ingredients can be products at any level.</p>
      {loading ? <div className="text-center text-gray-400 py-4">Loading...</div> : (
        <div className="space-y-2">
          {ingredients.length === 0 && <div className="text-gray-400 text-sm text-center py-3">No ingredients yet</div>}
          {ingredients.map(ing => (
            <div key={ing.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm font-medium text-gray-900">{ing.products?.name}</span>
              <span className="text-xs text-purple-600 font-mono">{ing.quantity} {ing.products?.unit}</span>
              <button onClick={() => removeIngredient(ing.id)} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <select value={selId} onChange={e => setSelId(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select ingredient...</option>
          {available.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_levels?.name || 'No level'})</option>)}
        </select>
        <Input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0.001" step="any" placeholder="Qty" className="w-20" />
        <Button onClick={addIngredient}>Add</Button>
      </div>
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

export default function IngredientsPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [bomProduct, setBomProduct] = useState<Product | null>(null)
  const [showLevelForm, setShowLevelForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())

  // Level form state
  const [levelName, setLevelName] = useState('')
  const [levelDesc, setLevelDesc] = useState('')

  // Product form state
  const [pName, setPName] = useState('')
  const [pCode, setPCode] = useState('')
  const [pUnit, setPUnit] = useState('units')
  const [pCost, setPCost] = useState('')
  const [pSell, setPSell] = useState('')
  const [pLevelId, setPLevelId] = useState('')

  const fetchAll = useCallback(async () => {
    const [{ data: lvls }, { data: prods }] = await Promise.all([
      supabase.from('product_levels').select('*').order('order_index'),
      supabase.from('products').select('*, product_levels(name)').order('name'),
    ])
    setLevels(lvls || [])
    setProducts(prods || [])
    setLoading(false)
    // Expand all levels by default
    setExpandedLevels(new Set((lvls || []).map((l: Level) => l.id)))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function saveLevel() {
    if (!levelName.trim()) { toast.error('Level name required'); return }
    const maxOrder = levels.length ? Math.max(...levels.map(l => l.order_index)) + 1 : 1
    const { error } = await supabase.from('product_levels').insert({ name: levelName, description: levelDesc, order_index: maxOrder })
    if (error) { toast.error(error.message); return }
    toast.success('Level created')
    setLevelName(''); setLevelDesc(''); setShowLevelForm(false); fetchAll()
  }

  async function deleteLevel(id: string) {
    if (!confirm('Delete this level? Products using it will become unassigned.')) return
    await supabase.from('product_levels').delete().eq('id', id)
    toast.success('Level deleted'); fetchAll()
  }

  function openProductForm(product?: Product, levelId?: string) {
    setEditingProduct(product || null)
    setPName(product?.name || '')
    setPCode(product?.code || '')
    setPUnit(product?.unit || 'units')
    setPCost(String(product?.cost_price || ''))
    setPSell(String(product?.sell_price || ''))
    setPLevelId(product?.level_id || levelId || '')
    setShowProductForm(true)
  }

  async function saveProduct() {
    if (!pName.trim() || !pLevelId) { toast.error('Name and level required'); return }
    const payload = { name: pName, code: pCode || null, level_id: pLevelId, unit: pUnit, cost_price: parseFloat(pCost) || 0, sell_price: parseFloat(pSell) || 0 }
    if (editingProduct) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id)
      toast.success('Product updated')
    } else {
      await supabase.from('products').insert({ ...payload, stock_quantity: 0 })
      toast.success('Product created')
    }
    setShowProductForm(false); fetchAll()
  }

  async function handleDelete() {
    if (!confirm(`Delete ${selected.size} product(s)?`)) return
    await supabase.from('products').delete().in('id', [...selected])
    toast.success('Deleted'); setSelected(new Set()); fetchAll()
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === filteredProducts.length) setSelected(new Set())
    else setSelected(new Set(filteredProducts.map(p => p.id)))
  }

  function toggleLevel(id: string) {
    setExpandedLevels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchProduct = productFilter ? p.id === productFilter : true
    return matchSearch && matchProduct
  })

  // Get the highest order_index level (Final Product)
  const maxOrder = levels.length ? Math.max(...levels.map(l => l.order_index)) : -1
  const finalLevelId = levels.find(l => l.order_index === maxOrder)?.id

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Ingredients / BOM</h1>
        <p className="text-sm text-gray-500 mt-1">Define product levels and build your bill of materials. Only Final Products are sellable in POS.</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowLevelForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Add Level
          </Button>
          <Button size="sm" variant="outline" onClick={() => openProductForm()}>
            <Plus className="w-4 h-4 mr-1.5" />Add Product
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-44" />
          </div>
        </div>
      </div>

      {/* Level form */}
      {showLevelForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">New Level</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input value={levelName} onChange={e => setLevelName(e.target.value)} placeholder="Level name (e.g. Raw Material)" />
            <Input value={levelDesc} onChange={e => setLevelDesc(e.target.value)} placeholder="Description (optional)" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveLevel}>Create Level</Button>
            <Button size="sm" variant="outline" onClick={() => setShowLevelForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : levels.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-medium">No levels yet</p>
          <p className="text-gray-400 text-sm mt-1">Start by creating levels like Raw Material, Level 2, Level 1, Final Product</p>
          <Button className="mt-4" onClick={() => setShowLevelForm(true)}><Plus className="w-4 h-4 mr-2" />Add Level</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select all */}
          {filteredProducts.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <input type="checkbox" checked={selected.size === filteredProducts.length && filteredProducts.length > 0} onChange={toggleAll} className="rounded" />
              <span className="text-xs text-gray-500">Select all ({filteredProducts.length})</span>
            </div>
          )}

          {levels.map(level => {
            const levelProducts = filteredProducts.filter(p => p.level_id === level.id)
            const isExpanded = expandedLevels.has(level.id)
            const isFinal = level.id === finalLevelId

            return (
              <div key={level.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Level header */}
                <div className={`flex items-center justify-between px-4 py-3 cursor-pointer ${isFinal ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-gray-50 border-b border-gray-100'}`}
                  onClick={() => toggleLevel(level.id)}>
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className={`text-sm font-semibold ${isFinal ? 'text-indigo-700' : 'text-gray-700'}`}>{level.name}</span>
                    {isFinal && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">Final Product - POS Sellable</span>}
                    <span className="text-xs text-gray-400">{levelProducts.length} products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openProductForm(undefined, level.id) }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add product
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteLevel(level.id) }}
                      className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Products in this level */}
                {isExpanded && (
                  <div className="divide-y divide-gray-50">
                    {levelProducts.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-gray-400 text-center">No products in this level</div>
                    ) : (
                      levelProducts.map(prod => (
                        <div key={prod.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${selected.has(prod.id) ? 'bg-indigo-50' : ''}`}>
                          <input type="checkbox" checked={selected.has(prod.id)} onChange={() => toggleSelect(prod.id)} className="rounded" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{prod.name}</p>
                            <div className="flex gap-3 mt-0.5">
                              {prod.code && <span className="text-xs text-gray-400">SKU: {prod.code}</span>}
                              <span className="text-xs text-gray-400">{prod.unit}</span>
                              {prod.cost_price > 0 && <span className="text-xs text-gray-400">Cost: ${prod.cost_price.toFixed(2)}</span>}
                              {isFinal && prod.sell_price > 0 && <span className="text-xs text-indigo-600 font-medium">Sell: ${prod.sell_price.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setBomProduct(prod)}
                              className="text-xs border border-gray-200 text-gray-600 hover:border-purple-400 hover:text-purple-600 px-2 py-1 rounded-lg transition-colors">
                              BOM
                            </button>
                            <button onClick={() => openProductForm(prod)} className="text-gray-400 hover:text-indigo-600">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Product form modal */}
      {showProductForm && (
        <Modal title={editingProduct ? 'Edit Product' : 'New Product'} onClose={() => setShowProductForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-gray-600">Product Name *</label>
              <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Coffee Blend A" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Code / SKU</label>
              <Input value={pCode} onChange={e => setPCode(e.target.value)} placeholder="e.g. PRD-001" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Unit</label>
              <Input value={pUnit} onChange={e => setPUnit(e.target.value)} placeholder="units / ml / g" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-gray-600">Level *</label>
              <select value={pLevelId} onChange={e => setPLevelId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select level...</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}{l.id === finalLevelId ? ' (Final Product)' : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Cost Price</label>
              <Input value={pCost} onChange={e => setPCost(e.target.value)} type="number" placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Sell Price</label>
              <Input value={pSell} onChange={e => setPSell(e.target.value)} type="number" placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Button onClick={saveProduct}>{editingProduct ? 'Update' : 'Create'} Product</Button>
            <Button variant="outline" onClick={() => setShowProductForm(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* BOM editor modal */}
      {bomProduct && (
        <BOMEditor product={bomProduct} allProducts={products} onClose={() => { setBomProduct(null); fetchAll() }} />
      )}
    </div>
  )
}
'@

Write-Host "All Items submenu files created!" -ForegroundColor Green
Write-Host "Run: npm run dev and check /items, /categories, /modifiers, /ingredients" -ForegroundColor Yellow
