'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, History, AlertTriangle, Package, X, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
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
      // Set absolute stock level
      const qty = parseFloat(quantity) || 0
      const alert = parseFloat(lowAlert) || 0

      if (inv?.id) {
        await supabase.from('inventory_levels')
          .update({ quantity: qty, low_stock_alert: alert })
          .eq('id', inv.id)
      } else {
        await supabase.from('inventory_levels')
          .insert({ shop_id: shop.id, item_id: item.id, quantity: qty, low_stock_alert: alert })
      }

      await supabase.from('stock_movements').insert({
        shop_id: shop.id, item_id: item.id,
        type: 'adjustment', quantity: qty,
        note: note || 'Manual stock set'
      })
      toast.success('Stock updated')
    } else {
      // Relative adjustment
      const qty = parseFloat(adjQty) || 0
      if (!qty) { toast.error('Enter a quantity'); setLoading(false); return }
      const current = inv?.quantity ?? 0
      const newQty = adjType === 'loss' ? Math.max(0, current - qty) : current + qty

      if (inv?.id) {
        await supabase.from('inventory_levels').update({ quantity: newQty }).eq('id', inv.id)
      } else {
        await supabase.from('inventory_levels')
          .insert({ shop_id: shop.id, item_id: item.id, quantity: newQty, low_stock_alert: 0 })
      }

      await supabase.from('stock_movements').insert({
        shop_id: shop.id, item_id: item.id,
        type: adjType,
        quantity: adjType === 'loss' ? -qty : qty,
        note: note || null
      })
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
          {/* Tabs */}
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
              {/* Type selector */}
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
            <>
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
            </>
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

  const typeConfig: Record<string, { label: string; color: string; sign: string }> = {
    restock:    { label: 'Restock',    color: 'text-green-600 bg-green-50', sign: '+' },
    adjustment: { label: 'Adjustment', color: 'text-blue-600 bg-blue-50',   sign: '' },
    sale:       { label: 'Sale',       color: 'text-gray-600 bg-gray-100',  sign: '-' },
    loss:       { label: 'Loss',       color: 'text-red-600 bg-red-50',     sign: '-' },
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
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
                const absQty = Math.abs(m.quantity)
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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)

  const load = useCallback(async () => {
  const { data: cats } = await supabase.from('categories').select('*').order('name')
  setCategories(cats || [])

  const { data: { session } } = await supabase.auth.getSession()
  console.log('session uid:', session?.user?.id)

  const { data, error } = await supabase
  .from('items')
  .select('id, name, sku, category_id, categories!items_category_id_fkey(name, color), inventory_levels(id, quantity, low_stock_alert)')
  .order('name')

  console.log('data:', data, 'error:', error)
  setItems((data as any) || [])
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
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Inventory</h1>
        <p className="text-sm text-gray-500 mt-1">Track stock levels for all items and raw materials</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: totalItems, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Low Stock', value: lowStock, icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Out of Stock', value: outOfStock, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Stock</option>
            <option value="ok">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No items found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Item</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Category</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">In Stock</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Low Alert</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => {
                const inv = item.inventory_levels?.[0]
                const status = getStockStatus(item)
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {item.categories ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: item.categories.color }}>
                          {item.categories.name}
                        </span>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${inv?.quantity === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        {inv?.quantity ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-500">{inv?.low_stock_alert ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={status.color}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setHistoryItem(item)}
                          className="text-gray-400 hover:text-indigo-600 transition-colors" title="View history">
                          <History className="w-4 h-4" />
                        </button>
                        <button onClick={() => setAdjustItem(item)}
                          className="text-gray-400 hover:text-indigo-600 transition-colors" title="Adjust stock">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={load} />}
      {historyItem && <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
    </div>
  )
}
