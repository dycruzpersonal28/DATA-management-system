'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, Plus, History, AlertTriangle, Package,
  X, ArrowUp, ArrowDown, RotateCcw, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

interface InventoryItem {
  id: string
  name: string
  sku: string | null
  category_id: string | null
  categories: { name: string; color: string } | null
  inventory_levels: { id: string; quantity: number; low_stock_alert: number }[]
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

// ── Quick Stock Modal (Add or Dispense) ───────────────────────────────────────
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

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave() {
    if (!selected) { toast.error('Select an item'); return }
    const amount = parseFloat(qty)
    if (!amount || amount <= 0) { toast.error('Enter a valid quantity'); return }

    setLoading(true)
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) { setLoading(false); return }

    const inv = selected.inventory_levels?.[0]
    const current = inv?.quantity ?? 0
    const newQty = mode === 'add' ? current + amount : Math.max(0, current - amount)

    if (inv?.id) {
      await supabase.from('inventory_levels').update({ quantity: newQty }).eq('id', inv.id)
    } else {
      await supabase.from('inventory_levels').insert({
        shop_id: shop.id, item_id: selected.id, quantity: newQty, low_stock_alert: 0,
      })
    }

    await supabase.from('stock_movements').insert({
      shop_id: shop.id,
      item_id: selected.id,
      type: mode === 'add' ? 'restock' : 'loss',
      quantity: mode === 'add' ? amount : -amount,
      note: note || (mode === 'add' ? 'Quick stock add' : 'Quick dispense'),
    })

    toast.success(mode === 'add' ? `Added ${amount} to ${selected.name}` : `Dispensed ${amount} from ${selected.name}`)
    setLoading(false)
    onSaved()
    onClose()
  }

  const isAdd = mode === 'add'
  const accent = isAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'
  const iconBg = isAdd ? 'bg-emerald-100' : 'bg-orange-100'
  const iconColor = isAdd ? 'text-emerald-600' : 'text-orange-600'
  const Icon = isAdd ? ArrowUpCircle : ArrowDownCircle

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-100 flex-shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isAdd ? 'Add Stock' : 'Dispense Stock'}</h2>
            <p className="text-xs text-gray-400">{isAdd ? 'Add incoming inventory' : 'Record stock used or removed'}</p>
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
                  Current stock: <strong>{selected.inventory_levels?.[0]?.quantity ?? 0}</strong>
                </p>
              </div>
              <button onClick={() => { setSelected(null); setSearch('') }} className="text-indigo-400 hover:text-indigo-600">
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
                  onClick={() => { setSelected(item); setSearch(item.name) }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                  </div>
                  <span className="text-sm font-semibold text-gray-500 flex-shrink-0 ml-3">
                    {item.inventory_levels?.[0]?.quantity ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="p-4 space-y-3 border-t border-gray-100 flex-shrink-0">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">
              Quantity to {isAdd ? 'add' : 'dispense'}
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="0"
              disabled={!selected}
            />
          </div>
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
            {loading ? 'Saving…' : isAdd ? 'Add Stock' : 'Dispense Stock'}
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
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) return

    if (tab === 'set') {
      const qty = parseFloat(quantity) || 0
      const alert = parseFloat(lowAlert) || 0
      if (inv?.id) {
        await supabase.from('inventory_levels').update({ quantity: qty, low_stock_alert: alert }).eq('id', inv.id)
      } else {
        await supabase.from('inventory_levels').insert({ shop_id: shop.id, item_id: item.id, quantity: qty, low_stock_alert: alert })
      }
      await supabase.from('stock_movements').insert({ shop_id: shop.id, item_id: item.id, type: 'adjustment', quantity: qty, note: note || 'Manual stock set' })
      toast.success('Stock updated')
    } else {
      const qty = parseFloat(adjQty) || 0
      if (!qty) { toast.error('Enter a quantity'); setLoading(false); return }
      const current = inv?.quantity ?? 0
      const newQty = adjType === 'loss' ? Math.max(0, current - qty) : current + qty
      if (inv?.id) {
        await supabase.from('inventory_levels').update({ quantity: newQty }).eq('id', inv.id)
      } else {
        await supabase.from('inventory_levels').insert({ shop_id: shop.id, item_id: item.id, quantity: newQty, low_stock_alert: 0 })
      }
      await supabase.from('stock_movements').insert({ shop_id: shop.id, item_id: item.id, type: adjType, quantity: adjType === 'loss' ? -qty : qty, note: note || null })
      toast.success('Stock adjusted')
    }

    setLoading(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Current stock: <strong>{inv?.quantity ?? 0}</strong> units</p>
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('stock_movements')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setMovements(data || []); setLoading(false) })
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
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : movements.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No movements yet</div>
          ) : (
            <div className="space-y-2">
              {movements.map(m => {
                const cfg = typeConfig[m.type] || typeConfig.adjustment
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString()}</p>
                      {m.note && <p className="text-xs text-gray-500 truncate">{m.note}</p>}
                    </div>
                    <span className={`text-sm font-semibold ${m.quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
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

  const load = useCallback(async () => {
    // Only load categories that have show_in_inventory = true
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('show_in_inventory', true)
      .order('name')
    setCategories(cats || [])

    const inventoryCatIds = new Set((cats || []).map((c: any) => c.id))

    const { data } = await supabase
      .from('items')
      .select('id, name, sku, category_id, categories!items_category_id_fkey(name, color), inventory_levels(id, quantity, low_stock_alert)')
      .order('name')

    // Only show items belonging to inventory-visible categories
    const visibleItems = ((data as any) || []).filter(
      (item: InventoryItem) => item.category_id && inventoryCatIds.has(item.category_id)
    )

    setItems(visibleItems)
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
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
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
                            <button onClick={() => setHistoryItem(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View history">
                              <History className="w-4 h-4" />
                            </button>
                            <button onClick={() => setAdjustItem(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Adjust stock">
                              <Plus className="w-4 h-4" />
                            </button>
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
    </div>
  )
}