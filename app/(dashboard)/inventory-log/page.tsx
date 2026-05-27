'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Download, Search, Package } from 'lucide-react'
import { toast } from 'sonner'

export default function InventoryLogPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

  useEffect(() => { loadLogs() }, [dateFrom, dateTo])

  async function loadLogs() {
    setLoading(true)
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('inventory_logs')
      .select('*, receipts(receipt_number)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false })

    if (error) { toast.error('Failed to load inventory logs'); setLoading(false); return }
    setLogs(data || [])
    setLoading(false)
  }

  function setPreset(preset: string) {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    if (preset === 'today') { setDateFrom(todayStr); setDateTo(todayStr) }
    else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      const yStr = y.toISOString().split('T')[0]
      setDateFrom(yStr); setDateTo(yStr)
    } else if (preset === 'week') {
      const w = new Date(now); w.setDate(w.getDate() - 6)
      setDateFrom(w.toISOString().split('T')[0]); setDateTo(todayStr)
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      setDateFrom(m.toISOString().split('T')[0]); setDateTo(todayStr)
    }
  }

  const filtered = logs.filter(l =>
    !search ||
    l.item_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.receipts?.receipt_number || '').toLowerCase().includes(search.toLowerCase())
  )

  function exportCSV() {
    const rows = [
      ['Date', 'Item', 'Receipt #', 'Before Qty', 'Change', 'After Qty'],
      ...filtered.map(l => [
        new Date(l.created_at).toLocaleString(),
        l.item_name,
        l.receipts?.receipt_number || '—',
        l.before_qty,
        l.change_qty,
        l.after_qty,
      ]),
    ]
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_log_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported inventory log CSV')
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventory Log</h1>
          <p className="text-sm text-gray-500 mt-1">Track stock changes from sales transactions</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-1.5" />Export CSV
        </Button>
      </div>

      {/* Date controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Today', key: 'today' },
            { label: 'Yesterday', key: 'yesterday' },
            { label: 'Last 7 days', key: 'week' },
            { label: 'This month', key: 'month' },
          ].map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-8">From</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-5">To</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 text-sm" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <Input placeholder="Search item or receipt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No inventory movements found</p>
            <p className="text-sm text-gray-400 mt-1">Only items with "Track stock" enabled appear here</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date & Time</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Item</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Receipt #</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Before</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Change</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">After</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700">{new Date(log.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{log.item_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-indigo-600 font-medium">
                      {log.receipts?.receipt_number || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-700">{log.before_qty}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${log.change_qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {log.change_qty > 0 ? '+' : ''}{log.change_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">{log.after_qty}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log.after_qty <= 0
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Out of stock</span>
                      : log.after_qty <= 5
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Low stock</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">In stock</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">{filtered.length} log entr{filtered.length !== 1 ? 'ies' : 'y'}</p>
    </div>
  )
}
