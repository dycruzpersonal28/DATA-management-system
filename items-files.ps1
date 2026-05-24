# ============================================================
# PHASE 3 - ITEMS MANAGEMENT
# Run from your project root in PowerShell
# ============================================================

New-Item -ItemType Directory -Force -Path "app/(dashboard)/items/[id]" | Out-Null

# -- app/(dashboard)/items/page.tsx --
Set-Content -Path "app/(dashboard)/items/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Pencil, Package } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ItemsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadItems() {
    const { data } = await supabase
      .from('items')
      .select('*, categories(name, color)')
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [])

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  async function toggleActive(item: any) {
    await supabase.from('items').update({ is_active: !item.is_active }).eq('id', item.id)
    toast.success(item.is_active ? 'Item deactivated' : 'Item activated')
    loadItems()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Items</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} total items</p>
        </div>
        <Link href="/items/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Add item
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No items found</p>
            <p className="text-gray-400 text-sm mt-1">Add your first item to get started</p>
            <Link href="/items/new">
              <Button className="mt-4" variant="outline">
                <Plus className="w-4 h-4 mr-2" /> Add item
              </Button>
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Category</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Price</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {item.categories ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: item.categories.color }}
                      >
                        {item.categories.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No category</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      ${Number(item.price).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(item)}>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
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

# -- app/(dashboard)/items/[id]/page.tsx --
Set-Content -Path "app/(dashboard)/items/[id]/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ItemPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const isNew = params.id === 'new'

  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    cost: '',
    sku: '',
    barcode: '',
    category_id: '',
    track_stock: false,
    is_active: true,
    tax_rate: '0',
  })

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('shop_id', shop.id)
        .order('name')
      setCategories(cats || [])

      if (!isNew) {
        const { data: item } = await supabase
          .from('items')
          .select('*')
          .eq('id', params.id)
          .single()
        if (item) {
          setForm({
            name: item.name || '',
            description: item.description || '',
            price: item.price?.toString() || '',
            cost: item.cost?.toString() || '',
            sku: item.sku || '',
            barcode: item.barcode || '',
            category_id: item.category_id || '',
            track_stock: item.track_stock || false,
            is_active: item.is_active ?? true,
            tax_rate: item.tax_rate?.toString() || '0',
          })
        }
      }
    }
    load()
  }, [params.id])

  function handleChange(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.price) {
      toast.error('Name and price are required')
      return
    }
    setLoading(true)

    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return

    const payload = {
      shop_id: shop.id,
      name: form.name,
      description: form.description || null,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      sku: form.sku || null,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      track_stock: form.track_stock,
      is_active: form.is_active,
      tax_rate: parseFloat(form.tax_rate) || 0,
    }

    if (isNew) {
      const { error } = await supabase.from('items').insert(payload)
      if (error) {
        toast.error('Failed to create item')
      } else {
        toast.success('Item created!')
        router.push('/items')
      }
    } else {
      const { error } = await supabase.from('items').update(payload).eq('id', params.id)
      if (error) {
        toast.error('Failed to save item')
      } else {
        toast.success('Item saved!')
      }
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this item? This cannot be undone.')) return
    await supabase.from('items').delete().eq('id', params.id as string)
    toast.success('Item deleted')
    router.push('/items')
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/items" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isNew ? 'New item' : 'Edit item'}
          </h1>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="outline" onClick={handleDelete} className="text-red-500 hover:text-red-700">
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save item'}
          </Button>
        </div>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item name *</Label>
            <Input
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Cappuccino"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              value={form.category_id}
              onChange={e => handleChange('category_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Selling price *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={e => handleChange('price', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cost price</Label>
              <Input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={e => handleChange('cost', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tax rate (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.tax_rate}
              onChange={e => handleChange('tax_rate', e.target.value)}
              placeholder="0"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory & tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={e => handleChange('sku', e.target.value)}
                placeholder="e.g. CAP-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input
                value={form.barcode}
                onChange={e => handleChange('barcode', e.target.value)}
                placeholder="e.g. 123456789"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Track stock</p>
              <p className="text-xs text-gray-500">Deduct from inventory on each sale</p>
            </div>
            <Switch
              checked={form.track_stock}
              onCheckedChange={v => handleChange('track_stock', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Active</p>
              <p className="text-xs text-gray-500">Show this item in POS</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={v => handleChange('is_active', v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
'@

Write-Host "Items management files created!" -ForegroundColor Green
