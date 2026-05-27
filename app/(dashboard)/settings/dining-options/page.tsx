'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, GripVertical, UtensilsCrossed } from 'lucide-react'

export default function DiningOptionsPage() {
  const supabase = createClient()
  const [options, setOptions] = useState<any[]>([])
  const [shopId, setShopId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return
      setShopId(shop.id)
      const { data } = await supabase.from('dining_options').select('*').eq('shop_id', shop.id).order('sort_order')
      setOptions(data || [])
    }
    load()
  }, [])

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required')
    setLoading(true)
    if (editingId) {
      const { error } = await supabase.from('dining_options').update({ name: form.name }).eq('id', editingId)
      if (error) { toast.error('Failed to save'); setLoading(false); return }
      setOptions(prev => prev.map(o => o.id === editingId ? { ...o, name: form.name } : o))
      toast.success('Updated')
      setEditingId(null)
    } else {
      const { data, error } = await supabase.from('dining_options')
        .insert({ shop_id: shopId, name: form.name, is_active: true, sort_order: options.length })
        .select().single()
      if (error) { toast.error('Failed to save'); setLoading(false); return }
      setOptions(prev => [...prev, data])
      toast.success('Dining option added')
      setAdding(false)
    }
    setForm({ name: '' })
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('dining_options').delete().eq('id', id)
    setOptions(prev => prev.filter(o => o.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(opt: any) {
    const val = !opt.is_active
    await supabase.from('dining_options').update({ is_active: val }).eq('id', opt.id)
    setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, is_active: val } : o))
  }

  function startEdit(opt: any) {
    setEditingId(opt.id)
    setAdding(false)
    setForm({ name: opt.name })
  }

  function cancel() {
    setEditingId(null)
    setAdding(false)
    setForm({ name: '' })
  }

  const PRESETS = ['Dine In', 'Takeout', 'Delivery', 'Drive-Thru']

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Dining Options</h2>
        <p className="text-sm text-gray-500 mt-1">Create dining options that cashiers can select when starting a new order.</p>
      </div>

      {/* Add / Edit form */}
      {(adding || editingId) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{editingId ? 'Edit Option' : 'Add Dining Option'}</h3>
          <div className="flex gap-2">
            <Input
              value={form.name}
              onChange={e => setForm({ name: e.target.value })}
              placeholder="e.g. Dine In, Takeout, Delivery"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <Button size="sm" onClick={handleSave} disabled={loading}>
              <Check className="w-3.5 h-3.5 mr-1.5" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={cancel}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Presets hint */}
      {!adding && !editingId && options.length === 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-indigo-600 font-medium mb-2">Quick add common options:</p>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={async () => {
                  setLoading(true)
                  const { data, error } = await supabase.from('dining_options')
                    .insert({ shop_id: shopId, name: p, is_active: true, sort_order: options.length })
                    .select().single()
                  if (!error && data) {
                    setOptions(prev => [...prev, data])
                    toast.success(`${p} added`)
                  }
                  setLoading(false)
                }}
                className="px-3 py-1 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
              >
                + {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add button */}
      {!adding && !editingId && (
        <Button variant="outline" size="sm" className="mb-4" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Dining Option
        </Button>
      )}

      {/* List */}
      <div className="space-y-2">
        {options.length === 0 && !adding && (
          <div className="text-center py-10 text-gray-400">
            <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No dining options yet.</p>
          </div>
        )}
        {options.map(opt => (
          <div key={opt.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center gap-3">
            <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${opt.is_active ? 'bg-teal-100' : 'bg-gray-100'}`}>
              <UtensilsCrossed className={`w-4 h-4 ${opt.is_active ? 'text-teal-600' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${opt.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{opt.name}</p>
              <p className="text-xs text-gray-400">{opt.is_active ? 'Active' : 'Inactive'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggle(opt)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  opt.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {opt.is_active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => startEdit(opt)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(opt.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
