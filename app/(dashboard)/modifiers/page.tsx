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
