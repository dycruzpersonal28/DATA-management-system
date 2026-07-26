'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, Plus, History, AlertTriangle, Package,
  X, ArrowUp, ArrowDown, RotateCcw, ArrowUpCircle, ArrowDownCircle, DollarSign, ChevronRight, Layers,
} from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

interface InventoryItem {
  id: string
  name: string
  sku: string | null
  category_id: string | null
  cost: number | null
  price: number | null
  stock_unit: string
  consumption_unit: string
  unit_conversion: number
  track_expiry: boolean
  use_conversion: boolean
  categories: { name: string; color: string } | null
  inventory_levels: { id: string; quantity: number; low_stock_alert: number }[]
  batches?: StockBatch[]
}

interface StockBatch {
  id: string
  batch_no: string | null
  expiry_date: string | null
  pack_size: number
  pack_unit: string
  qty_packs: number
  qty_base: number
  qty_remaining: number
  conversion: number
  note: string | null
  received_at: string
  preset_id: string | null
}

interface ConversionPreset {
  id: string
  label: string
  pack_unit: string
  pack_size: number
  conversion: number
  sort_order: number
}

interface Movement {
  id: string
  item_id: string
  type: 'restock' | 'adjustment' | 'sale' | 'loss'
  quantity: number
  note: string | null
  created_at: string
  items?: { name: string }
}

// ── Popover Date Picker (compact, auto-hides on select) ───────────────────────
function InlineDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const handler = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const today = new Date()
  const initYear = value ? parseInt(value.slice(0, 4)) : today.getFullYear()
  const initMonth = value ? parseInt(value.slice(5, 7)) - 1 : today.getMonth()
  const [viewYear, setViewYear] = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)

  const selected = value ? new Date(value + 'T00:00:00') : null
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa']

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function selectDay(day: number) {
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const iso = `${viewYear}-${mm}-${dd}`
    onChange(iso === value ? '' : iso)
    setOpen(false)
  }

  function isSelected(day: number) {
    return selected?.getFullYear() === viewYear &&
      selected?.getMonth() === viewMonth &&
      selected?.getDate() === day
  }

  const displayLabel = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Pick a date (optional)'

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Trigger button */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors text-left ${
            value
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={value ? 'font-medium' : ''}>{displayLabel}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Clear date"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Popover calendar */}
      {open && (
        <div className="absolute z-50 mt-1 border border-gray-200 rounded-xl p-3 bg-white shadow-lg select-none w-64">
          {/* Nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-xs font-semibold text-gray-700">{monthNames[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
          {/* Day names */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => (
              <div key={i} className="flex items-center justify-center">
                {day === null ? null : (
                  <button
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                      isSelected(day)
                        ? 'bg-emerald-500 text-white'
                        : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Quick Stock Modal (Receive Stock or Dispense) ─────────────────────────────
function QuickStockModal({
  mode,
  items,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'dispense'
  items: InventoryItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  // Receive Stock (batch) fields
  const [batchNo, setBatchNo] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [packSize, setPackSize] = useState('1')
  const [packUnit, setPackUnit] = useState('pcs')
  const [conversion, setConversion] = useState('1')

  // Preset state
  const [presets, setPresets] = useState<ConversionPreset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [presetMode, setPresetMode] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  // Dispense: available batches for selected item (FIFO)
  const [dispenseBatches, setDispenseBatches] = useState<StockBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)

  // Conversion toggle (per item, persisted to DB)
  const [useConversion, setUseConversion] = useState(true)
  const [conversionToggling, setConversionToggling] = useState(false)

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(search.toLowerCase())
  )

  async function fetchPresets(itemId: string) {
    setPresetsLoading(true)
    const { data } = await supabase
      .from('item_conversion_presets')
      .select('*')
      .eq('item_id', itemId)
      .order('sort_order', { ascending: true })
    const list = data || []
    setPresets(list)
    setPresetsLoading(false)
    // Auto-enable preset mode if presets exist, apply first preset
    if (list.length > 0) {
      setPresetMode(true)
      applyPreset(list[0])
    } else {
      setPresetMode(false)
      setSelectedPresetId(null)
    }
  }

  function applyPreset(preset: ConversionPreset) {
    setSelectedPresetId(preset.id)
    setPackUnit(preset.pack_unit)
    setPackSize(String(preset.pack_size))
    setConversion(String(preset.conversion))
  }

  function handlePresetChange(presetId: string) {
    if (presetId === '__manual__') {
      setPresetMode(false)
      setSelectedPresetId(null)
      return
    }
    const preset = presets.find(p => p.id === presetId)
    if (preset) applyPreset(preset)
  }

  function handleSelect(item: InventoryItem) {
    setSelected(item)
    setSearch(item.name)
    // Reset batch fields to item defaults
    setPackUnit(item.stock_unit || 'pcs')
    setConversion(String(item.unit_conversion ?? 1))
    setPackSize('1')
    setSelectedBatchId(null)
    setPresets([])
    setPresetMode(false)
    setSelectedPresetId(null)
    setUseConversion(item.use_conversion !== false)
    if (mode === 'add') {
      fetchPresets(item.id)
    } else {
      supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', item.id)
        .gt('qty_remaining', 0)
        .order('received_at', { ascending: true })
        .then(({ data }) => {
          setDispenseBatches(data || [])
          if (data && data.length > 0) setSelectedBatchId(data[0].id)
        })
    }
  }

  const qtyNum = parseFloat(qty) || 0
  const convNum = parseFloat(conversion) || 1
  const preview = mode === 'add'
    ? useConversion
      ? (qtyNum * parseFloat(packSize || '1') * convNum).toFixed(2)
      : qtyNum.toFixed(2)
    : null

  async function handleSave() {
    if (!selected) { toast.error('Select an item'); return }
    const amount = parseFloat(qty)
    if (!amount || amount <= 0) { toast.error('Enter a valid quantity'); return }

    setLoading(true)
    try {
      if (mode === 'add') {
        const res = await fetch('/api/inventory/batch_receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id:     selected.id,
            batch_no:    batchNo || null,
            expiry_date: expiryDate || null,
            pack_size:   useConversion ? (parseFloat(packSize) || 1) : 1,
            pack_unit:   useConversion ? (packUnit || selected.stock_unit || 'pcs') : (selected.stock_unit || 'pcs'),
            qty_packs:   amount,
            conversion:  useConversion ? (parseFloat(conversion) || 1) : 1,
            note:        note || null,
            preset_id:   useConversion ? (selectedPresetId || null) : null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to receive stock')
        toast.success(`Received ${amount} ${selected.stock_unit || 'unit'}(s) → +${preview} ${selected.consumption_unit || 'units'} for ${selected.name}`)
      } else {
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id:   selected.id,
            mode:      'adjust',
            adj_type:  'loss',
            quantity:  amount,
            batch_id:  selectedBatchId || null,
            note:      note || 'Quick dispense',
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to update stock')
        toast.success(`Dispensed ${amount} from ${selected.name}`)
      }
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isAdd = mode === 'add'
  const accent = isAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'
  const iconBg = isAdd ? 'bg-emerald-100' : 'bg-orange-100'
  const iconColor = isAdd ? 'text-emerald-600' : 'text-orange-600'
  const Icon = isAdd ? ArrowUpCircle : ArrowDownCircle
  const currentQty = selected?.inventory_levels?.[0]?.quantity ?? 0
  const stockUnit  = selected?.stock_unit        || 'pcs'
  const consUnit   = selected?.consumption_unit  || 'pcs'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-100 flex-shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isAdd ? 'Receive Stock' : 'Dispense Stock'}</h2>
            <p className="text-xs text-gray-400">{isAdd ? 'Log incoming delivery with batch details' : 'Record stock used or removed'}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Search + list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              autoFocus
              placeholder="Search item..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
              className="pl-8"
            />
          </div>

          {selected ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-800 truncate">{selected.name}</p>
                <p className="text-xs text-indigo-500">
                  Current stock:{' '}
                  {selected.unit_conversion > 1 ? (
                    <>
                      <strong>{(currentQty / selected.unit_conversion).toFixed(2)} {stockUnit}</strong>
                      <span className="ml-1 text-indigo-400">({currentQty} {consUnit})</span>
                    </>
                  ) : (
                    <strong>{currentQty} {consUnit}</strong>
                  )}
                </p>
              </div>
              <button onClick={() => { setSelected(null); setSearch(''); setPresets([]); setPresetMode(false) }} className="text-indigo-400 hover:text-indigo-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No items found</p>
              ) : filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {item.unit_conversion > 1 ? (
                      <>
                        <p className="text-sm font-semibold text-gray-700">
                          {((item.inventory_levels?.[0]?.quantity ?? 0) / item.unit_conversion).toFixed(2)} {item.stock_unit || 'pcs'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.inventory_levels?.[0]?.quantity ?? 0} {item.consumption_unit || 'pcs'}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-gray-500">
                        {item.inventory_levels?.[0]?.quantity ?? 0}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Batch fields — only for Receive Stock */}
          {isAdd && selected && (
            <div className="space-y-3 pt-1">

              {/* Conversion toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <p className="text-xs font-medium text-gray-700">Use conversion</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {useConversion ? 'Pack size × conversion applied' : 'Quantity added directly, no conversion'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={conversionToggling}
                  onClick={async () => {
                    if (!selected) return
                    const newVal = !useConversion
                    setUseConversion(newVal)
                    setConversionToggling(true)
                    try {
                      await supabase.from('items').update({ use_conversion: newVal }).eq('id', selected.id)
                    } catch {
                      setUseConversion(!newVal) // revert on error
                    } finally {
                      setConversionToggling(false)
                    }
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${useConversion ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${useConversion ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Preset / Manual toggle — only shown if presets exist or still loading */}
              {(presetsLoading || presets.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-600">Conversion preset</label>
                    {presets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = !presetMode
                          setPresetMode(next)
                          if (next && presets.length > 0) applyPreset(presets[0])
                          else setSelectedPresetId(null)
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                          presetMode
                            ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {presetMode ? 'Switch to Manual' : 'Use Preset'}
                      </button>
                    )}
                  </div>

                  {presetsLoading ? (
                    <div className="h-9 bg-gray-50 animate-pulse rounded-lg" />
                  ) : presetMode && presets.length > 0 ? (
                    <select
                      value={selectedPresetId || ''}
                      onChange={e => handlePresetChange(e.target.value)}
                      className="w-full border border-indigo-200 bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {presets.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.label} — {p.pack_unit}, {p.pack_size} {consUnit}/pack
                        </option>
                      ))}
                      <option value="__manual__">✏️ Enter manually…</option>
                    </select>
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    {useConversion ? 'Qty of packs received' : 'Quantity received'}
                  </label>
                  <Input
                    type="number" min="0" step="any"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    placeholder="0"
                  />
                </div>
                {useConversion && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Pack unit</label>
                    <Input
                      value={packUnit}
                      onChange={e => setPackUnit(e.target.value)}
                      placeholder="e.g. bag, box, bottle"
                      readOnly={presetMode}
                      className={presetMode ? 'bg-gray-50 text-gray-500 cursor-default' : ''}
                    />
                  </div>
                )}
              </div>
              {useConversion && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Pack size ({consUnit} per pack)</label>
                    <Input
                      type="number" min="1" step="any"
                      value={packSize}
                      onChange={e => setPackSize(e.target.value)}
                      placeholder="1"
                      readOnly={presetMode}
                      className={presetMode ? 'bg-gray-50 text-gray-500 cursor-default' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Conversion to {consUnit}</label>
                    <Input
                      type="number" min="1" step="any"
                      value={conversion}
                      onChange={e => setConversion(e.target.value)}
                      placeholder="1"
                      readOnly={presetMode}
                      className={presetMode ? 'bg-gray-50 text-gray-500 cursor-default' : ''}
                    />
                  </div>
                </div>
              )}
              {/* Expiry date — always shown for add mode, inline calendar */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Expiry date <span className="text-gray-300 font-normal">(optional)</span>
                </label>
                <InlineDatePicker value={expiryDate} onChange={setExpiryDate} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Batch / lot no. <span className="text-gray-300 font-normal">(optional)</span></label>
                <Input value={batchNo} onChange={e => setBatchNo(e.target.value)} placeholder="e.g. LOT-20250601" />
              </div>
              {preview && qtyNum > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-xs text-emerald-700">
                  Will add <strong>+{preview} {consUnit}</strong> to stock
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form fields — dispense only (note + qty at bottom) */}
        <div className="p-4 space-y-3 border-t border-gray-100 flex-shrink-0">
          {!isAdd && selected && dispenseBatches.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                Batch to dispense from
                <span className="text-[10px] font-normal text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full ml-1">FIFO</span>
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {dispenseBatches.map((b, idx) => {
                  const isExpired = b.expiry_date && new Date(b.expiry_date) < new Date()
                  const expLabel = b.expiry_date
                    ? new Date(b.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : null
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBatchId(b.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 text-left transition-colors ${
                        selectedBatchId === b.id
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {idx === 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 uppercase tracking-wide">Next</span>}
                          <span className="text-xs font-medium text-gray-800 truncate">{b.batch_no || 'No batch no.'}</span>
                          {isExpired && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">Expired</span>}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {expLabel ? `Exp ${expLabel} · ` : ''}{b.qty_remaining} {consUnit} remaining
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ml-3 flex items-center justify-center ${selectedBatchId === b.id ? 'border-orange-400 bg-orange-400' : 'border-gray-300'}`}>
                        {selectedBatchId === b.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {!isAdd && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Quantity to dispense</label>
              <Input
                type="number" min="0" step="any"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                disabled={!selected}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Note <span className="text-gray-300 font-normal">(optional)</span></label>
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={isAdd ? 'e.g. Delivery from supplier' : 'e.g. Used for prep'}
              disabled={!selected}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={loading || !selected || !qty}
            className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${accent}`}
          >
            {loading ? 'Saving…' : isAdd ? 'Receive Stock' : 'Dispense Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Adjust Modal (existing per-item modal) ────────────────────────────────────
function AdjustModal({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void }) {
  const inv = item.inventory_levels?.[0]
  const [quantity, setQuantity] = useState(String(inv?.quantity ?? 0))
  const [lowAlert, setLowAlert] = useState(String(inv?.low_stock_alert ?? 0))
  const [adjType, setAdjType] = useState<'restock' | 'adjustment' | 'loss'>('restock')
  const [adjQty, setAdjQty] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'set' | 'adjust'>('adjust')

  async function handleSave() {
    setLoading(true)
    try {
      const body =
        tab === 'set'
          ? {
              item_id:          item.id,
              mode:             'set',
              quantity:         parseFloat(quantity) || 0,
              low_stock_alert:  parseFloat(lowAlert) || 0,
              note:             note || 'Manual stock set',
            }
          : {
              item_id:  item.id,
              mode:     'adjust',
              adj_type: adjType,
              quantity: parseFloat(adjQty) || 0,
              note:     note || null,
            }

      if (tab === 'adjust' && !(parseFloat(adjQty) > 0)) {
        toast.error('Enter a quantity')
        setLoading(false)
        return
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update stock')

      toast.success(tab === 'set' ? 'Stock updated' : 'Stock adjusted')
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Current stock:{' '}
              {item.unit_conversion > 1 ? (
                <>
                  <strong>{((inv?.quantity ?? 0) / item.unit_conversion).toFixed(2)} {item.stock_unit || 'pcs'}</strong>
                  <span className="ml-1">({inv?.quantity ?? 0} {item.consumption_unit || 'pcs'})</span>
                </>
              ) : (
                <strong>{inv?.quantity ?? 0} {item.consumption_unit || 'pcs'}</strong>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['adjust', 'set'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {t === 'adjust' ? 'Adjust Stock' : 'Set Stock'}
              </button>
            ))}
          </div>
          {tab === 'adjust' ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'restock', label: 'Restock', icon: ArrowUp, color: 'text-green-600 border-green-200 bg-green-50' },
                  { key: 'adjustment', label: 'Adjustment', icon: RotateCcw, color: 'text-blue-600 border-blue-200 bg-blue-50' },
                  { key: 'loss', label: 'Loss', icon: ArrowDown, color: 'text-red-600 border-red-200 bg-red-50' },
                ] as const).map(({ key, label, icon: Icon, color }) => (
                  <button key={key} onClick={() => setAdjType(key)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${adjType === key ? color + ' border-current' : 'border-gray-200 text-gray-500'}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Quantity</label>
                <Input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="0" min="0" step="any" autoFocus />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Stock quantity</label>
                <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" min="0" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Low stock alert</label>
                <Input type="number" value={lowAlert} onChange={e => setLowAlert(e.target.value)} placeholder="0" min="0" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Note (optional)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for adjustment..." />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [batches, setBatches]     = useState<StockBatch[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'movements' | 'batches'>('movements')

  const consUnit = item.consumption_unit || 'pcs'
  const stockUnit = item.stock_unit || 'pcs'

  useEffect(() => {
    Promise.all([
      supabase.from('stock_movements')
        .select('*')
        .eq('item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('stock_batches')
        .select('*')
        .eq('item_id', item.id)
        .order('received_at', { ascending: false }),
    ]).then(([movRes, batchRes]) => {
      setMovements(movRes.data || [])
      setBatches(batchRes.data || [])
      setLoading(false)
    })
  }, [item.id])

  const typeConfig: Record<string, { label: string; color: string }> = {
    restock:    { label: 'Restock',    color: 'text-green-600 bg-green-50' },
    adjustment: { label: 'Adjustment', color: 'text-blue-600 bg-blue-50' },
    sale:       { label: 'Sale',       color: 'text-gray-600 bg-gray-100' },
    loss:       { label: 'Loss',       color: 'text-red-600 bg-red-50' },
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-xl" style={{ maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Stock History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-gray-100 flex-shrink-0">
          {(['movements', 'batches'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'movements' ? 'Movement Log' : `Batches${batches.length ? ` (${batches.length})` : ''}`}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : tab === 'movements' ? (
            movements.length === 0 ? (
              <div className="text-center text-gray-400 py-8">No movements yet</div>
            ) : (
              <div className="space-y-2">
                {movements.map(m => {
                  const cfg = typeConfig[m.type] || typeConfig.adjustment
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}</p>
                        {m.note && <p className="text-xs text-gray-500 truncate">{m.note}</p>}
                      </div>
                      <span className={`text-sm font-semibold ${m.quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.quantity >= 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            /* Batches tab */
            batches.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No batches yet</p>
                <p className="text-xs mt-1">Use "Receive Stock" to log your first delivery</p>
              </div>
            ) : (
              <div className="space-y-2">
                {batches.map(b => {
                  const isExpired = b.expiry_date && new Date(b.expiry_date) < new Date()
                  const isLow = b.qty_remaining > 0 && b.qty_remaining < b.qty_base * 0.2
                  return (
                    <div key={b.id} className="border border-gray-100 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {b.batch_no || 'No batch no.'}
                          </span>
                          {isExpired && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex-shrink-0">Expired</span>
                          )}
                          {isLow && !isExpired && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-600 flex-shrink-0">Low</span>
                          )}
                        </div>
                        <span className={`text-sm font-semibold flex-shrink-0 ${b.qty_remaining === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {b.qty_remaining} / {b.qty_base} {consUnit}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>Received {new Date(b.received_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}</span>
                        {b.expiry_date && (
                          <span className={isExpired ? 'text-red-500' : ''}>
                            Exp {new Date(b.expiry_date).toLocaleDateString('en-US')}
                          </span>
                        )}
                        <span>{b.qty_packs} {b.pack_unit} × {b.pack_size} {stockUnit}</span>
                      </div>
                      {b.note && <p className="text-xs text-gray-400 truncate">{b.note}</p>}
                      {/* Remaining bar */}
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all ${b.qty_remaining === 0 ? 'bg-gray-300' : isExpired ? 'bg-red-400' : isLow ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                          style={{ width: `${b.qty_base > 0 ? Math.min(100, (b.qty_remaining / b.qty_base) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}


// ── Item Pricing Drawer (owner / manager only) ────────────────────────────────
function ItemDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
}) {
  const [cost, setCost] = useState(item.cost != null ? String(item.cost) : '')
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '')
  const [loading, setLoading] = useState(false)

  const margin =
    parseFloat(price) > 0 && parseFloat(cost) >= 0
      ? (((parseFloat(price) - parseFloat(cost)) / parseFloat(price)) * 100).toFixed(1)
      : null

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost:  cost  !== '' ? parseFloat(cost)  : 0,
          price: price !== '' ? parseFloat(price) : 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      toast.success('Pricing updated')
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{item.name}</h2>
            {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Stock snapshot */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Current Stock</p>
            <p className="text-2xl font-bold text-gray-900">
              {item.inventory_levels?.[0]?.quantity ?? '—'}
            </p>
          </div>

          {/* Pricing fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Cost Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Selling Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          {/* Margin indicator */}
          {margin !== null && (
            <div className={`rounded-xl p-4 ${parseFloat(margin) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Gross Margin</p>
              <p className={`text-xl font-bold ${parseFloat(margin) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {margin}%
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                ₱{(parseFloat(price) - parseFloat(cost)).toFixed(2)} per unit
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save Pricing'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [quickMode, setQuickMode] = useState<'add' | 'dispense' | null>(null)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null)
  const [presetMap, setPresetMap] = useState<Record<string, { label: string }>>({})

  const canViewPricing = ['owner', 'manager'].includes((userRole ?? '').toLowerCase())

  useEffect(() => {
    async function fetchRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('app_users')
        .select('role')
        .eq('auth_user_id', user.id)
        .single()
      if (data?.role) setUserRole(data.role)
    }
    fetchRole()
  }, [])

  const load = useCallback(async () => {
    // Only load categories that have show_in_inventory = true
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('show_in_inventory', true)
      .order('name')
    setCategories(cats || [])

    const inventoryCatIds = new Set((cats || []).map((c: any) => c.id))

    // Use the API route (admin client) so stock_batches RLS is bypassed
    const res = await fetch('/api/inventory')
    const json = await res.json()

    const allItems: InventoryItem[] = json.items || []
    const batchMap: Record<string, StockBatch[]> = json.batches || {}

    // Load all conversion presets for this shop (for label display in table)
    const { data: presetsData } = await supabase
      .from('item_conversion_presets')
      .select('id, label')
    const map: Record<string, { label: string }> = {}
    for (const p of presetsData || []) map[p.id] = { label: p.label }
    setPresetMap(map)

    // Only show items belonging to inventory-visible categories
    const visibleItems = allItems.filter(
      (item: InventoryItem) => item.category_id && inventoryCatIds.has(item.category_id)
    )

    // Spread into new objects and attach batches
    const itemsWithBatches: InventoryItem[] = visibleItems.map((item: InventoryItem) => ({
      ...item,
      batches: batchMap[item.id] || [],
    }))

    setItems(itemsWithBatches)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter ? item.category_id === catFilter : true
    const qty = item.inventory_levels?.[0]?.quantity ?? null
    const alert = item.inventory_levels?.[0]?.low_stock_alert ?? 0
    const matchStock =
      stockFilter === 'low' ? (qty !== null && qty > 0 && qty <= alert) :
      stockFilter === 'out' ? (qty === 0 || qty === null) :
      stockFilter === 'ok'  ? (qty !== null && qty > alert) : true
    return matchSearch && matchCat && matchStock
  })

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [search, catFilter, stockFilter, rowsPerPage])

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  const totalItems = items.length
  const outOfStock = items.filter(i => (i.inventory_levels?.[0]?.quantity ?? 0) === 0).length
  const lowStock = items.filter(i => {
    const qty = i.inventory_levels?.[0]?.quantity ?? 0
    const alert = i.inventory_levels?.[0]?.low_stock_alert ?? 0
    return qty > 0 && alert > 0 && qty <= alert
  }).length

  function getStockStatus(item: InventoryItem) {
    const qty = item.inventory_levels?.[0]?.quantity ?? null
    const alert = item.inventory_levels?.[0]?.low_stock_alert ?? 0
    if (qty === null) return { label: 'Not tracked', color: 'secondary' as const }
    if (qty === 0) return { label: 'Out of stock', color: 'destructive' as const }
    if (alert > 0 && qty <= alert) return { label: 'Low stock', color: 'secondary' as const }
    return { label: 'In stock', color: 'default' as const }
  }

  return (
    <div className="p-3 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Inventory</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Track stock levels for all items and raw materials</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="hidden sm:inline">Dashboard</span>
        </button>
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setQuickMode('add')}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
        >
          <ArrowUpCircle className="w-4 h-4 flex-shrink-0" />
          <span>Add Stock</span>
        </button>
        <button
          onClick={() => setQuickMode('dispense')}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
        >
          <ArrowDownCircle className="w-4 h-4 flex-shrink-0" />
          <span>Dispense Stock</span>
        </button>
      </div>

      {/* Summary cards — 3 cols on tablet and up */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Total Items', value: totalItems, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Low Stock', value: lowStock, icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Out of Stock', value: outOfStock, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 ${s.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{s.value}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters — stack on mobile, row on tablet */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1 flex-wrap">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="">All Stock</option>
            <option value="ok">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full sm:w-56" />
        </div>
      </div>

      {/* Table — horizontally scrollable on small screens, vertically scrollable with sticky header */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No items found</div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <table className="w-full min-w-[480px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 px-3 sm:px-4 py-3">Item</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 sm:px-4 py-3 hidden sm:table-cell">Category</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 sm:px-4 py-3 hidden lg:table-cell">Stocks in Packs</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 sm:px-4 py-3 hidden lg:table-cell">Packs</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 sm:px-4 py-3">In Stock</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 sm:px-4 py-3 hidden md:table-cell">Low Alert</th>
                    <th className="text-center text-xs font-medium text-gray-500 px-3 sm:px-4 py-3">Status</th>
                    <th className="px-3 sm:px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(item => {
                    const inv = item.inventory_levels?.[0]
                    const status = getStockStatus(item)
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          canViewPricing
                            ? 'hover:bg-indigo-50/60 cursor-pointer'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => canViewPricing && setDrawerItem(item)}
                      >
                        <td className="px-3 sm:px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 leading-tight">{item.name}</p>
                          {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                          {/* Show category inline on mobile */}
                          {item.categories && (
                            <span className="inline-flex sm:hidden items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white mt-1"
                              style={{ backgroundColor: item.categories.color }}>
                              {item.categories.name}
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                          {item.categories ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: item.categories.color }}>
                              {item.categories.name}
                            </span>
                          ) : <span className="text-xs text-gray-400">-</span>}
                        </td>

                        {/* Stocks in Packs — sum of qty_packs directly from active batches */}
                        <td className="px-3 sm:px-4 py-3 text-right hidden lg:table-cell">
                          {item.batches && item.batches.length > 0 ? (() => {
                            const activeBatches = item.batches.filter(b => b.qty_remaining > 0)
                            if (activeBatches.length === 0) return <span className="text-xs text-gray-400">—</span>
                            // Derive remaining packs live from qty_remaining so it depletes as stock is consumed
                            const totalRemainingPacks = activeBatches.reduce((sum, b) => {
                              const unitsPerPack = (b.pack_size || 1) * (b.conversion || 1)
                              return sum + (unitsPerPack > 0 ? b.qty_remaining / unitsPerPack : 0)
                            }, 0)
                            const totalOriginalPacks = activeBatches.reduce((sum, b) => sum + (b.qty_packs || 0), 0)
                            const packUnit = activeBatches[0]?.pack_unit || item.stock_unit || 'pcs'
                            const fmt = (n: number) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2))
                            const refBatch = activeBatches[0]
                            const consUnit = item.consumption_unit || 'pcs'
                            // Use preset label if batch was received with a preset, else fall back to unit description
                            const presetLabel = refBatch.preset_id
                              ? presetMap[refBatch.preset_id]?.label ?? null
                              : null
                            const description = presetLabel
                              ?? `${fmt((refBatch.pack_size || 1) * (refBatch.conversion || 1))} ${consUnit} / ${packUnit}`
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-sm font-semibold text-gray-900">
                                  {fmt(totalRemainingPacks)}
                                  {totalRemainingPacks < totalOriginalPacks && (
                                    <span className="text-xs font-normal text-gray-400 ml-1">/ {fmt(totalOriginalPacks)}</span>
                                  )}
                                  <span className="text-xs font-normal text-gray-500 ml-1">{packUnit}</span>
                                </span>
                                <span className="text-[10px] text-gray-400">{description}</span>
                              </div>
                            )
                          })() : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Packs — vertical batch pills */}
                        <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                          {item.batches && item.batches.length > 0 ? (
                            <div className="flex flex-col gap-1 items-end">
                              {item.batches.map(b => {
                                const isExpired = b.expiry_date && new Date(b.expiry_date) < new Date()
                                const expLabel = b.expiry_date
                                  ? new Date(b.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                                  : null
                                // remaining packs for this batch
                                const unitsPerPack = (b.pack_size || 1) * (b.conversion || 1)
                                const remainingPacks = unitsPerPack > 0
                                  ? b.qty_remaining / unitsPerPack
                                  : b.qty_remaining
                                const displayPacks = Number.isInteger(remainingPacks)
                                  ? remainingPacks
                                  : remainingPacks.toFixed(2)
                                return (
                                  <span
                                    key={b.id}
                                    title={`${displayPacks} ${b.pack_unit || item.stock_unit || 'pcs'} · ${b.qty_remaining} ${item.consumption_unit || 'pcs'} remaining${expLabel ? ` · Exp ${expLabel}` : ''}${b.batch_no ? ` · ${b.batch_no}` : ''}`}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium leading-tight border ${
                                      isExpired
                                        ? 'bg-red-50 text-red-600 border-red-200'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}
                                  >
                                    <span className="font-semibold">{displayPacks}</span>
                                    <span className="opacity-60">{b.pack_unit || item.stock_unit || 'pcs'}</span>
                                    {expLabel && <span className="opacity-70">{expLabel}</span>}
                                  </span>
                                )
                              })}
                            </div>
                          ) : item.unit_conversion > 1 ? (
                            <span className="text-sm font-medium text-gray-700 text-right block">
                              {((inv?.quantity ?? 0) / item.unit_conversion).toFixed(2)}
                              <span className="text-xs text-gray-400 ml-1">{item.stock_unit || 'pcs'}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <span className={`text-sm font-semibold ${inv?.quantity === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                            {inv?.quantity ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right hidden md:table-cell">
                          <span className="text-sm text-gray-500">{inv?.low_stock_alert ?? '-'}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <Badge variant={status.color}>{status.label}</Badge>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                            <button onClick={e => { e.stopPropagation(); setHistoryItem(item) }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View history">
                              <History className="w-4 h-4" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setAdjustItem(item) }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Adjust stock">
                              <Plus className="w-4 h-4" />
                            </button>
                            {canViewPricing && (
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom bar: rows per page + pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="hidden sm:inline">Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>
                  {filtered.length === 0 ? '0' : `${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, filtered.length)}`} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="First page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" /></svg>
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="px-1 font-medium text-gray-700">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Last page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {quickMode && (
        <QuickStockModal
          mode={quickMode}
          items={items}
          onClose={() => setQuickMode(null)}
          onSaved={load}
        />
      )}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={load} />}
      {historyItem && <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {drawerItem && canViewPricing && (
        <ItemDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onSaved={load} />
      )}
    </div>
  )
}