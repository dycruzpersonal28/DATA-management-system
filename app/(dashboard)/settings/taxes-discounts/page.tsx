'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, Percent, Hash } from 'lucide-react'

// ─── Tax Rates ────────────────────────────────────────────────────────────────
type TaxEntry = { id: string; shop_id: string; name: string; rate: number; is_default: boolean; is_active: boolean; type?: string; value?: number }

function TaxForm({ initial, onSave, onCancel, loading }: {
  initial: Partial<TaxEntry>
  onSave: (data: Pick<TaxEntry, 'name' | 'rate' | 'is_active' | 'is_default'>) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({ name: initial.name || '', rate: initial.rate?.toString() || '' })
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. VAT, GST" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Rate (%)</label>
          <Input type="number" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. 12" min="0" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={loading}
          onClick={() => onSave({ name: form.name, rate: parseFloat(form.rate) || 0, is_active: true, is_default: initial.is_default ?? false })}>
          <Check className="w-3.5 h-3.5 mr-1.5" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1.5" /> Cancel</Button>
      </div>
    </div>
  )
}

function TaxRow({ entry, onEdit, onDelete, onToggle }: { entry: TaxEntry; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${entry.is_active ? 'bg-indigo-100' : 'bg-gray-100'}`}>
        <Percent className={`w-4 h-4 ${entry.is_active ? 'text-indigo-600' : 'text-gray-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${entry.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{entry.name}</p>
        <p className="text-xs text-gray-400">{entry.rate}%</p>
      </div>
      <button onClick={onToggle} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
        entry.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
      }`}>
        {entry.is_active ? 'Active' : 'Inactive'}
      </button>
      <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Pencil className="w-3.5 h-3.5" /></button>
      <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  )
}

function TaxSection({ shopId }: { shopId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<TaxEntry[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!shopId) return
    supabase.from('tax_rates').select('*').eq('shop_id', shopId).order('created_at').then(({ data }) => setItems(data || []))
  }, [shopId])

  async function handleAdd(data: Pick<TaxEntry, 'name' | 'rate' | 'is_active' | 'is_default'>) {
    if (!data.name.trim()) return toast.error('Name required')
    if (!shopId) return toast.error('Shop not loaded yet')
    setLoading(true)
    const { data: row, error } = await supabase.from('tax_rates').insert({ ...data, shop_id: shopId }).select().single()
    if (error) { toast.error('Failed to add: ' + error.message); setLoading(false); return }
    setItems(p => [...p, row])
    setAdding(false)
    toast.success('Tax rate added')
    setLoading(false)
  }

  async function handleUpdate(id: string, data: Pick<TaxEntry, 'name' | 'rate' | 'is_active' | 'is_default'>) {
    if (!data.name.trim()) return toast.error('Name required')
    setLoading(true)
    const { error } = await supabase.from('tax_rates').update(data).eq('id', id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to update: ' + error.message); setLoading(false); return }
    setItems(p => p.map(i => i.id === id ? { ...i, ...data } : i))
    setEditingId(null)
    toast.success('Updated')
    setLoading(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('tax_rates').delete().eq('id', id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to delete: ' + error.message); return }
    setItems(p => p.filter(i => i.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(entry: TaxEntry) {
    const val = !entry.is_active
    const { error } = await supabase.from('tax_rates').update({ is_active: val }).eq('id', entry.id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to update'); return }
    setItems(p => p.map(i => i.id === entry.id ? { ...i, is_active: val } : i))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Tax Rates</h3>
          <p className="text-xs text-gray-500 mt-0.5">Applied to orders at checkout. Can be toggled per transaction.</p>
        </div>
        <Button size="sm" variant="outline" disabled={!shopId} onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {adding && <TaxForm initial={{}} onSave={handleAdd} onCancel={() => setAdding(false)} loading={loading} />}
        {items.map(item => editingId === item.id ? (
          <TaxForm key={item.id} initial={item} onSave={data => handleUpdate(item.id, data)} onCancel={() => setEditingId(null)} loading={loading} />
        ) : (
          <TaxRow key={item.id} entry={item}
            onEdit={() => { setEditingId(item.id); setAdding(false) }}
            onDelete={() => handleDelete(item.id)}
            onToggle={() => handleToggle(item)}
          />
        ))}
        {items.length === 0 && !adding && <div className="text-center py-6 text-gray-400 text-xs">No tax rates added yet.</div>}
      </div>
    </div>
  )
}

// ─── Discounts ────────────────────────────────────────────────────────────────
type DiscountEntry = { id: string; shop_id: string; name: string; type: 'percent' | 'fixed'; value: number; is_active: boolean }

function DiscountForm({ initial, onSave, onCancel, loading, symbol }: {
  initial: Partial<DiscountEntry>
  onSave: (data: Omit<DiscountEntry, 'id' | 'shop_id'>) => void
  onCancel: () => void
  loading: boolean
  symbol: string
}) {
  const [form, setForm] = useState({ name: initial.name || '', type: initial.type || 'percent', value: initial.value?.toString() || '' })
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Staff Discount" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Value</label>
          <Input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder={form.type === 'percent' ? 'e.g. 10' : `e.g. 50`} min="0" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">Type</label>
        <div className="flex gap-2">
          {[
            { v: 'percent', label: '% Percentage', icon: Percent },
            { v: 'fixed',   label: `${symbol} Fixed Amount`, icon: Hash },
          ].map(({ v, label, icon: Icon }) => (
            <button key={v} onClick={() => setForm(p => ({ ...p, type: v as any }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                form.type === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={loading}
          onClick={() => onSave({ name: form.name, type: form.type as 'percent' | 'fixed', value: parseFloat(form.value) || 0, is_active: true })}>
          <Check className="w-3.5 h-3.5 mr-1.5" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1.5" /> Cancel</Button>
      </div>
    </div>
  )
}

function DiscountRow({ entry, onEdit, onDelete, onToggle, symbol }: { entry: DiscountEntry; onEdit: () => void; onDelete: () => void; onToggle: () => void; symbol: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${entry.is_active ? 'bg-indigo-100' : 'bg-gray-100'}`}>
        {entry.type === 'percent'
          ? <Percent className={`w-4 h-4 ${entry.is_active ? 'text-indigo-600' : 'text-gray-400'}`} />
          : <Hash className={`w-4 h-4 ${entry.is_active ? 'text-indigo-600' : 'text-gray-400'}`} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${entry.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{entry.name}</p>
        <p className="text-xs text-gray-400">
          {entry.type === 'percent' ? `${entry.value}%` : `${symbol}${entry.value.toFixed(2)} fixed`}
        </p>
      </div>
      <button onClick={onToggle} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
        entry.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
      }`}>
        {entry.is_active ? 'Active' : 'Inactive'}
      </button>
      <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Pencil className="w-3.5 h-3.5" /></button>
      <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  )
}

function DiscountSection({ shopId, symbol }: { shopId: string; symbol: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<DiscountEntry[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!shopId) return
    supabase.from('discounts').select('*').eq('shop_id', shopId).order('created_at').then(({ data }) => setItems(data || []))
  }, [shopId])

  async function handleAdd(data: Omit<DiscountEntry, 'id' | 'shop_id'>) {
    if (!data.name.trim()) return toast.error('Name required')
    if (!shopId) return toast.error('Shop not loaded yet')
    setLoading(true)
    const { data: row, error } = await supabase.from('discounts').insert({ ...data, shop_id: shopId }).select().single()
    if (error) { toast.error('Failed to add: ' + error.message); setLoading(false); return }
    setItems(p => [...p, row])
    setAdding(false)
    toast.success('Discount added')
    setLoading(false)
  }

  async function handleUpdate(id: string, data: Omit<DiscountEntry, 'id' | 'shop_id'>) {
    if (!data.name.trim()) return toast.error('Name required')
    setLoading(true)
    const { error } = await supabase.from('discounts').update(data).eq('id', id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to update: ' + error.message); setLoading(false); return }
    setItems(p => p.map(i => i.id === id ? { ...i, ...data } : i))
    setEditingId(null)
    toast.success('Updated')
    setLoading(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('discounts').delete().eq('id', id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to delete: ' + error.message); return }
    setItems(p => p.filter(i => i.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(entry: DiscountEntry) {
    const val = !entry.is_active
    const { error } = await supabase.from('discounts').update({ is_active: val }).eq('id', entry.id).eq('shop_id', shopId)
    if (error) { toast.error('Failed to update'); return }
    setItems(p => p.map(i => i.id === entry.id ? { ...i, is_active: val } : i))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Discounts</h3>
          <p className="text-xs text-gray-500 mt-0.5">Cashier can apply these during checkout.</p>
        </div>
        <Button size="sm" variant="outline" disabled={!shopId} onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {adding && <DiscountForm initial={{}} onSave={handleAdd} onCancel={() => setAdding(false)} loading={loading} symbol={symbol} />}
        {items.map(item => editingId === item.id ? (
          <DiscountForm key={item.id} initial={item} onSave={data => handleUpdate(item.id, data)} onCancel={() => setEditingId(null)} loading={loading} symbol={symbol} />
        ) : (
          <DiscountRow key={item.id} entry={item} symbol={symbol}
            onEdit={() => { setEditingId(item.id); setAdding(false) }}
            onDelete={() => handleDelete(item.id)}
            onToggle={() => handleToggle(item)}
          />
        ))}
        {items.length === 0 && !adding && <div className="text-center py-6 text-gray-400 text-xs">No discounts added yet.</div>}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TaxesDiscountsPage() {
  const supabase = createClient()
  const [shopId, setShopId] = useState('')
  const [symbol, setSymbol] = useState('$')

  useEffect(() => {
    supabase.from('shops').select('id, currency_symbol').single().then(({ data }) => {
      if (data) { setShopId(data.id); setSymbol(data.currency_symbol || '$') }
    })
  }, [])

  return (
    <div className="p-8 max-w-2xl space-y-10">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Taxes & Discounts</h2>
        <p className="text-sm text-gray-500 mt-1">Create tax rates and discount options available at checkout.</p>
      </div>
      <TaxSection shopId={shopId} />
      <div className="border-t border-gray-100" />
      <DiscountSection shopId={shopId} symbol={symbol} />
    </div>
  )
}