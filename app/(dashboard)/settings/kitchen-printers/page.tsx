'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, Printer, ChevronDown, ChevronUp, Wifi, Network } from 'lucide-react'

type PrinterGroup = {
  id: string
  name: string
  printer_type: string
  printer_address: string
  is_active: boolean
  sort_order: number
  categories?: string[] // category ids assigned
}

function PrinterGroupForm({
  initial,
  categories,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<PrinterGroup>
  categories: any[]
  onSave: (data: any) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    printer_type: initial?.printer_type || 'network',
    printer_address: initial?.printer_address || '',
  })
  const [selectedCats, setSelectedCats] = useState<string[]>(initial?.categories || [])

  function toggleCat(id: string) {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Printer Group Name</label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Kitchen, Bar, Grill" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">IP Address / Port</label>
          <Input value={form.printer_address} onChange={e => setForm(p => ({ ...p, printer_address: e.target.value }))} placeholder="e.g. 192.168.1.100:9100" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">Connection Type</label>
        <div className="flex gap-2">
          {[
            { v: 'network', label: 'Network (LAN)', icon: Network },
            { v: 'wifi', label: 'Wi-Fi', icon: Wifi },
          ].map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setForm(p => ({ ...p, printer_type: v }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                form.printer_type === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">
          Assigned Categories <span className="text-gray-300 font-normal">(items from these categories will print here)</span>
        </label>
        {categories.length === 0 ? (
          <p className="text-xs text-gray-400">No categories found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => toggleCat(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                  selectedCats.includes(cat.id)
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#6366f1' }} />
                <span className="truncate text-xs font-medium">{cat.name}</span>
                {selectedCats.includes(cat.id) && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={loading} onClick={() => onSave({ ...form, categories: selectedCats })}>
          <Check className="w-3.5 h-3.5 mr-1.5" /> Save Printer Group
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
        </Button>
      </div>
    </div>
  )
}

export default function KitchenPrintersPage() {
  const supabase = createClient()
  const [groups, setGroups] = useState<PrinterGroup[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [shopId, setShopId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return
      setShopId(shop.id)

      const [{ data: grps }, { data: cats }, { data: pgc }] = await Promise.all([
        supabase.from('printer_groups').select('*').eq('shop_id', shop.id).order('sort_order'),
        supabase.from('categories').select('*').eq('shop_id', shop.id).order('name'),
        supabase.from('printer_group_categories').select('*'),
      ])

      const catMap = new Map<string, string[]>()
      for (const row of (pgc || [])) {
        if (!catMap.has(row.printer_group_id)) catMap.set(row.printer_group_id, [])
        catMap.get(row.printer_group_id)!.push(row.category_id)
      }

      setGroups((grps || []).map(g => ({ ...g, categories: catMap.get(g.id) || [] })))
      setCategories(cats || [])
    }
    load()
  }, [])

  async function handleSave(data: any, id?: string) {
    if (!data.name.trim()) return toast.error('Name required')
    setLoading(true)

    if (id) {
      // Update
      const { error } = await supabase.from('printer_groups').update({
        name: data.name, printer_type: data.printer_type, printer_address: data.printer_address,
      }).eq('id', id)
      if (error) { toast.error('Failed'); setLoading(false); return }

      // Sync categories
      await supabase.from('printer_group_categories').delete().eq('printer_group_id', id)
      if (data.categories.length > 0) {
        await supabase.from('printer_group_categories').insert(
          data.categories.map((cid: string) => ({ printer_group_id: id, category_id: cid }))
        )
      }

      setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g))
      toast.success('Updated')
      setEditingId(null)
    } else {
      // Insert
      const { data: row, error } = await supabase.from('printer_groups')
        .insert({ shop_id: shopId, name: data.name, printer_type: data.printer_type, printer_address: data.printer_address, is_active: true, sort_order: groups.length })
        .select().single()
      if (error) { toast.error('Failed'); setLoading(false); return }

      if (data.categories.length > 0) {
        await supabase.from('printer_group_categories').insert(
          data.categories.map((cid: string) => ({ printer_group_id: row.id, category_id: cid }))
        )
      }

      setGroups(prev => [...prev, { ...row, categories: data.categories }])
      toast.success('Printer group added')
      setAdding(false)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('printer_groups').delete().eq('id', id)
    setGroups(prev => prev.filter(g => g.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(g: PrinterGroup) {
    const val = !g.is_active
    await supabase.from('printer_groups').update({ is_active: val }).eq('id', g.id)
    setGroups(prev => prev.map(p => p.id === g.id ? { ...p, is_active: val } : p))
  }

  const catName = (id: string) => categories.find(c => c.id === id)?.name || id

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Kitchen Printers</h2>
        <p className="text-sm text-gray-500 mt-1">Set up printer groups and assign categories to each printer.</p>
      </div>

      {adding && (
        <div className="mb-5">
          <PrinterGroupForm
            categories={categories}
            onSave={data => handleSave(data)}
            onCancel={() => setAdding(false)}
            loading={loading}
          />
        </div>
      )}

      {!adding && (
        <Button variant="outline" size="sm" className="mb-5" onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Printer Group
        </Button>
      )}

      <div className="space-y-3">
        {groups.length === 0 && !adding && (
          <div className="text-center py-10 text-gray-400">
            <Printer className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No printer groups yet.</p>
          </div>
        )}

        {groups.map(g => (
          <div key={g.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {editingId === g.id ? (
              <div className="p-4">
                <PrinterGroupForm
                  initial={g}
                  categories={categories}
                  onSave={data => handleSave(data, g.id)}
                  onCancel={() => setEditingId(null)}
                  loading={loading}
                />
              </div>
            ) : (
              <>
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${g.is_active ? 'bg-orange-100' : 'bg-gray-100'}`}>
                    <Printer className={`w-4 h-4 ${g.is_active ? 'text-orange-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${g.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{g.name}</p>
                    <p className="text-xs text-gray-400">
                      {g.printer_address || 'No address set'} · {(g.categories?.length || 0)} categor{g.categories?.length === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggle(g)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      g.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}>
                      {g.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => { setEditingId(g.id); setAdding(false) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpandedId(expandedId === g.id ? null : g.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      {expandedId === g.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {expandedId === g.id && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Assigned Categories</p>
                    {(g.categories?.length || 0) === 0 ? (
                      <p className="text-xs text-gray-400">No categories assigned. Edit to assign categories.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {g.categories!.map(cid => (
                          <span key={cid} className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 font-medium">
                            {catName(cid)}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-500 mb-1 mt-3">Connection</p>
                    <p className="text-xs text-gray-500">{g.printer_type === 'wifi' ? 'Wi-Fi' : 'Network (LAN)'} · {g.printer_address || 'No address set'}</p>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
