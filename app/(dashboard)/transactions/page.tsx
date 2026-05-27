'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Search, ChevronDown, ChevronUp, Receipt } from 'lucide-react'
import { toast } from 'sonner'

export default function TransactionsPage() {
  const supabase = createClient()
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [currencySymbol, setCurrencySymbol] = useState('₱')

  // Date range
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(todayStr)
  const [dateTo, setDateTo] = useState(todayStr)

  useEffect(() => {
    supabase.from('shops').select('currency_symbol').single().then(({ data }) => {
      if (data) setCurrencySymbol(data.currency_symbol)
    })
  }, [])

  useEffect(() => {
    loadReceipts()
  }, [dateFrom, dateTo])

  async function loadReceipts() {
    setLoading(true)
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('receipts')
      .select('*, receipt_items(*), payment_types(name)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false })

    if (error) { toast.error('Failed to load transactions'); setLoading(false); return }
    setReceipts(data || [])
    setLoading(false)
  }

  function setPreset(preset: string) {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    if (preset === 'today') {
      setDateFrom(todayStr); setDateTo(todayStr)
    } else if (preset === 'yesterday') {
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

  const filtered = receipts.filter(r =>
    !search ||
    r.receipt_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.payment_types?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalSales = filtered.reduce((s, r) => s + (r.status === 'completed' ? r.total : 0), 0)

  function exportCSV() {
    const rows = [
      ['Receipt #', 'Date', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Status'],
      ...filtered.map(r => [
        r.receipt_number,
        new Date(r.created_at).toLocaleString(),
        (r.receipt_items || []).length,
        r.subtotal.toFixed(2),
        r.discount_amount.toFixed(2),
        r.total.toFixed(2),
        r.payment_types?.name || 'Cash',
        r.status,
      ]),
    ]
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported transactions CSV')
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">View and export your sales history</p>
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

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Transactions', value: filtered.length.toString() },
          { label: 'Total sales', value: `${currencySymbol}${totalSales.toFixed(2)}` },
          { label: 'Avg. order', value: filtered.length > 0 ? `${currencySymbol}${(totalSales / filtered.filter(r => r.status === 'completed').length || 0).toFixed(2)}` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <Input placeholder="Search receipt #..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No transactions found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting the date range</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Receipt #</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date & Time</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Items</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Subtotal</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Discount</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Total</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Payment</th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-indigo-600">{r.receipt_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{new Date(r.created_at).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleTimeString()}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-700">{(r.receipt_items || []).length}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-700">{currencySymbol}{r.subtotal.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.discount_amount > 0
                        ? <span className="text-sm text-green-600">-{currencySymbol}{r.discount_amount.toFixed(2)}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{currencySymbol}{r.total.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{r.payment_types?.name || 'Cash'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'voided' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {expanded === r.id
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </td>
                  </tr>

                  {/* Expanded receipt items */}
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={9} className="px-4 pb-4 bg-gray-50">
                        <div className="border border-gray-200 rounded-xl overflow-hidden mt-1">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 bg-white">
                                <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Item</th>
                                <th className="text-center text-xs font-medium text-gray-400 px-3 py-2">Qty</th>
                                <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Unit price</th>
                                <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(r.receipt_items || []).map((ri: any) => (
                                <tr key={ri.id} className="bg-white">
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-gray-800">{ri.item_name}</p>
                                    {ri.addons && ri.addons.length > 0 && (
                                      <div className="mt-0.5 space-y-0.5">
                                        {ri.addons.map((a: any, i: number) => (
                                          <p key={i} className="text-xs text-indigo-500">
                                            + {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''} ({currencySymbol}{(a.price * a.quantity).toFixed(2)})
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                    {ri.note && <p className="text-xs text-amber-600 mt-0.5">📝 {ri.note}</p>}
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-700">{ri.quantity}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{currencySymbol}{ri.unit_price.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">{currencySymbol}{ri.line_total.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  )
}
