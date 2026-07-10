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

  async function togglePosVisibility(cat: any) {
    const newVal = !cat.show_in_pos
    await supabase.from('categories').update({ show_in_pos: newVal }).eq('id', cat.id)
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, show_in_pos: newVal } : c))
    toast.success(newVal ? `${cat.name} visible in POS` : `${cat.name} hidden from POS`)
  }

  async function toggleInventoryVisibility(cat: any) {
    const newVal = !cat.show_in_inventory
    await supabase.from('categories').update({ show_in_inventory: newVal }).eq('id', cat.id)
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, show_in_inventory: newVal } : c))
    toast.success(newVal ? `${cat.name} visible in Inventory` : `${cat.name} hidden from Inventory`)
  }

  async function toggleItemsVisibility(cat: any) {
    const newVal = !cat.show_in_items
    await supabase.from('categories').update({ show_in_items: newVal }).eq('id', cat.id)
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, show_in_items: newVal } : c))
    toast.success(newVal ? `${cat.name} visible in Items` : `${cat.name} hidden from Items`)
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
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">POS</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Inventory</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Items</th>
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
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePosVisibility(cat)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${cat.show_in_pos !== false ? 'bg-indigo-500' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cat.show_in_pos !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleInventoryVisibility(cat)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${cat.show_in_inventory !== false ? 'bg-indigo-500' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cat.show_in_inventory !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleItemsVisibility(cat)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${cat.show_in_items !== false ? 'bg-indigo-500' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cat.show_in_items !== false ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
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
