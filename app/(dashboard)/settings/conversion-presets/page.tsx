'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Pencil, Trash2, Check, X, Layers, ChevronDown, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConversionPreset {
  id: string
  item_id: string
  label: string
  pack_unit: string
  pack_size: number
  conversion: number
  sort_order: number
}

interface Item {
  id: string
  name: string
  sku: string | null
  stock_unit: string
  consumption_unit: string
}

const EMPTY_FORM = { label: '', pack_unit: 'pcs', pack_size: '1', conversion: '1' }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ConversionPresetsPage() {
  const supabase = createClient()
  const [shopId,   setShopId]   = useState('')
  const [items,    setItems]    = useState<Item[]>([])
  const [presets,  setPresets]  = useState<ConversionPreset[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Add / edit form state
  const [form,            setForm]            = useState(EMPTY_FORM)
  const [selectedItemId,  setSelectedItemId]  = useState('')
  const [itemSearch,      setItemSearch]      = useState('')
  const [showDropdown,    setShowDropdown]    = useState(false)
  const [editing,         setEditing]         = useState<ConversionPreset | null>(null)
  const [saving,          setSaving]          = useState(false)

  // ── Collapsed item groups
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Close item dropdown on outside click
  const dropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Load shop + data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('shop_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!appUser?.shop_id) return
      setShopId(appUser.shop_id)

      const [{ data: itemsData }, { data: presetsData }] = await Promise.all([
        supabase
          .from('items')
          .select('id, name, sku, stock_unit, consumption_unit')
          .eq('shop_id', appUser.shop_id)
          .order('name'),
        supabase
          .from('item_conversion_presets')
          .select('*')
          .eq('shop_id', appUser.shop_id)
          .order('sort_order'),
      ])

      setItems(itemsData || [])
      setPresets(presetsData || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived
  const itemsWithPresets = items.filter(item => presets.some(p => p.item_id === item.id))
  const filteredItems    = items.filter(i =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(itemSearch.toLowerCase())
  )
  const selectedItem = items.find(i => i.id === selectedItemId)

  // ── Save (add or update)
  async function handleSave() {
    if (!selectedItemId)             return toast.error('Select an item')
    if (!form.label.trim())          return toast.error('Label is required')
    if (!form.pack_unit.trim())      return toast.error('Pack unit is required')
    if (parseFloat(form.pack_size)  <= 0) return toast.error('Pack size must be > 0')
    if (parseFloat(form.conversion) <= 0) return toast.error('Conversion must be > 0')

    setSaving(true)

    if (editing) {
      const { error } = await supabase
        .from('item_conversion_presets')
        .update({
          label:      form.label.trim(),
          pack_unit:  form.pack_unit.trim(),
          pack_size:  parseFloat(form.pack_size),
          conversion: parseFloat(form.conversion),
        })
        .eq('id', editing.id)

      if (error) { toast.error('Failed to update'); setSaving(false); return }

      setPresets(prev => prev.map(p => p.id === editing.id
        ? { ...p, label: form.label.trim(), pack_unit: form.pack_unit.trim(), pack_size: parseFloat(form.pack_size), conversion: parseFloat(form.conversion) }
        : p
      ))
      toast.success('Preset updated')
    } else {
      const { data, error } = await supabase
        .from('item_conversion_presets')
        .insert({
          shop_id:    shopId,
          item_id:    selectedItemId,
          label:      form.label.trim(),
          pack_unit:  form.pack_unit.trim(),
          pack_size:  parseFloat(form.pack_size),
          conversion: parseFloat(form.conversion),
          sort_order: presets.filter(p => p.item_id === selectedItemId).length,
        })
        .select()
        .single()

      if (error) { toast.error('Failed to add'); setSaving(false); return }
      setPresets(prev => [...prev, data])
      toast.success('Preset added')
    }

    cancelEdit()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this preset? This cannot be undone.')) return
    await supabase.from('item_conversion_presets').delete().eq('id', id)
    setPresets(prev => prev.filter(p => p.id !== id))
    toast.success('Deleted')
  }

  function startEdit(preset: ConversionPreset) {
    setEditing(preset)
    setSelectedItemId(preset.item_id)
    const item = items.find(i => i.id === preset.item_id)
    setItemSearch(item?.name || '')
    setForm({
      label:      preset.label,
      pack_unit:  preset.pack_unit,
      pack_size:  String(preset.pack_size),
      conversion: String(preset.conversion),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setSelectedItemId('')
    setItemSearch('')
    setForm(EMPTY_FORM)
  }

  // ── Preview calculation
  const packSizeNum  = parseFloat(form.pack_size)  || 0
  const conversionNum = parseFloat(form.conversion) || 0
  const showPreview  = selectedItem && packSizeNum > 0 && conversionNum > 0

  return (
    <div className="p-8 max-w-2xl">
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Conversion Presets</h2>
        <p className="text-sm text-gray-500 mt-1">
          Save pack configurations per item so staff can quickly fill batch details when receiving stock.
        </p>
      </div>

      {/* ── Add / Edit Form ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          {editing ? 'Edit Preset' : 'Add Preset'}
        </h3>

        <div className="space-y-4">

          {/* Item picker */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Item</label>
            <div className="relative" ref={dropdownRef}>
              <Input
                placeholder="Search item…"
                value={itemSearch}
                onChange={e => {
                  setItemSearch(e.target.value)
                  if (!editing) { setSelectedItemId(''); setShowDropdown(true) }
                }}
                onFocus={() => { if (!editing && !selectedItemId) setShowDropdown(true) }}
                disabled={!!editing}
                className={selectedItemId
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium'
                  : ''}
              />
              {selectedItemId && !editing && (
                <button
                  onClick={() => { setSelectedItemId(''); setItemSearch('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {showDropdown && !selectedItemId && !editing && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No items found</p>
                  ) : filteredItems.slice(0, 30).map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id)
                        setItemSearch(item.name)
                        setShowDropdown(false)
                        setForm(f => ({ ...f, pack_unit: item.stock_unit || 'pcs' }))
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left text-sm transition-colors"
                    >
                      <span className="font-medium text-gray-800">{item.name}</span>
                      {item.sku && <span className="text-xs text-gray-400 ml-2">{item.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Preset label</label>
            <Input
              value={form.label}
              onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              placeholder="e.g. 1 bag of 50kg, Case of 24 bottles"
            />
          </div>

          {/* Pack unit / size / conversion */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Pack unit</label>
              <Input
                value={form.pack_unit}
                onChange={e => setForm(p => ({ ...p, pack_unit: e.target.value }))}
                placeholder="bag, box, bottle"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Pack size</label>
              <Input
                type="number" min="0.001" step="any"
                value={form.pack_size}
                onChange={e => setForm(p => ({ ...p, pack_size: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Conversion{selectedItem ? ` → ${selectedItem.consumption_unit || 'units'}` : ''}
              </label>
              <Input
                type="number" min="0.001" step="any"
                value={form.conversion}
                onChange={e => setForm(p => ({ ...p, conversion: e.target.value }))}
                placeholder="1"
              />
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-700">
              1 <strong>{form.pack_unit || 'pack'}</strong> ={' '}
              <strong>{(packSizeNum * conversionNum).toLocaleString()}</strong>{' '}
              <strong>{selectedItem!.consumption_unit || 'units'}</strong>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {editing ? 'Update' : 'Add'}
            </Button>
            {editing && (
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Preset list grouped by item ──────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : itemsWithPresets.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No presets yet. Add one above.
        </div>
      ) : (
        <div className="space-y-3">
          {itemsWithPresets.map(item => {
            const itemPresets  = presets.filter(p => p.item_id === item.id)
            const isCollapsed  = collapsed[item.id]
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

                {/* Item group header */}
                <button
                  onClick={() => setCollapsed(p => ({ ...p, [item.id]: !p[item.id] }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">
                        {itemPresets.length} preset{itemPresets.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-gray-400" />
                    : <ChevronDown  className="w-4 h-4 text-gray-400" />
                  }
                </button>

                {/* Preset rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {itemPresets.map(preset => (
                      <div key={preset.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{preset.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {preset.pack_unit}
                            {' · '}size {preset.pack_size}
                            {' · '}×{preset.conversion}
                            {' → '}
                            <strong className="text-gray-600">
                              {preset.pack_size * preset.conversion} {item.consumption_unit || 'units'}
                            </strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEdit(preset)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(preset.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
