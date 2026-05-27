'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, GripVertical, CreditCard, Banknote, Wallet, Check, X } from 'lucide-react'

const ICONS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'wallet', label: 'Wallet', icon: Wallet },
]

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {ICONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
            value === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

function PaymentTypeRow({ pt, onEdit, onDelete, onToggle }: any) {
  const IconComp = ICONS.find(i => i.value === pt.icon)?.icon || CreditCard
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab" />
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${pt.is_active ? 'bg-indigo-100' : 'bg-gray-100'}`}>
        <IconComp className={`w-4 h-4 ${pt.is_active ? 'text-indigo-600' : 'text-gray-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${pt.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{pt.name}</p>
        <p className="text-xs text-gray-400">{pt.is_active ? 'Active' : 'Inactive'}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(pt)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            pt.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          {pt.is_active ? 'Active' : 'Inactive'}
        </button>
        <button onClick={() => onEdit(pt)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(pt.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function PaymentTypesPage() {
  const supabase = createClient()
  const [types, setTypes] = useState<any[]>([])
  const [shopId, setShopId] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({ name: '', icon: 'cash' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return
      setShopId(shop.id)
      const { data } = await supabase.from('payment_types').select('*').eq('shop_id', shop.id).order('sort_order')
      setTypes(data || [])
    }
    load()
  }, [])

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required')
    setLoading(true)
    if (editing?.id) {
      const { error } = await supabase.from('payment_types').update({ name: form.name, icon: form.icon }).eq('id', editing.id)
      if (error) { toast.error('Failed to save'); setLoading(false); return }
      setTypes(prev => prev.map(t => t.id === editing.id ? { ...t, name: form.name, icon: form.icon } : t))
      toast.success('Payment type updated')
    } else {
      const { data, error } = await supabase.from('payment_types')
        .insert({ shop_id: shopId, name: form.name, icon: form.icon, is_active: true, sort_order: types.length })
        .select().single()
      if (error) { toast.error('Failed to save'); setLoading(false); return }
      setTypes(prev => [...prev, data])
      toast.success('Payment type added')
    }
    setEditing(null)
    setForm({ name: '', icon: 'cash' })
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('payment_types').delete().eq('id', id)
    setTypes(prev => prev.filter(t => t.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(pt: any) {
    const val = !pt.is_active
    await supabase.from('payment_types').update({ is_active: val }).eq('id', pt.id)
    setTypes(prev => prev.map(t => t.id === pt.id ? { ...t, is_active: val } : t))
  }

  function startEdit(pt: any) {
    setEditing(pt)
    setForm({ name: pt.name, icon: pt.icon || 'cash' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm({ name: '', icon: 'cash' })
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payment Types</h2>
        <p className="text-sm text-gray-500 mt-1">Create payment methods available at checkout.</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{editing ? 'Edit Payment Type' : 'Add Payment Type'}</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Name</label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Cash, Visa, GCash" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Icon</label>
            <IconPicker value={form.icon} onChange={v => setForm(p => ({ ...p, icon: v }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={loading} size="sm">
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {editing ? 'Update' : 'Add'}
            </Button>
            {editing && (
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {types.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No payment types yet. Add one above.</div>
        )}
        {types.map(pt => (
          <PaymentTypeRow key={pt.id} pt={pt} onEdit={startEdit} onDelete={handleDelete} onToggle={handleToggle} />
        ))}
      </div>
    </div>
  )
}
