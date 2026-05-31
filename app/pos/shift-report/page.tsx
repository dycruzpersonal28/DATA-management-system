'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useShop } from '@/lib/hooks/useShop'
import {
  X, Printer, Ban, Edit2, RefreshCw, ShieldCheck, TrendingUp,
  DollarSign, ArrowDownCircle, ArrowUpCircle, Receipt, ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Tiny pie chart ────────────────────────────────────────────────────────────
function PieChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">No data</div>
  let cumAngle = -Math.PI / 2
  const cx = 80, cy = 80, r = 70
  const slices = segments.map(seg => {
    const angle = (seg.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle)
    const y2 = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return { ...seg, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` }
  })
  return (
    <svg viewBox="0 0 160 160" className="w-32 h-32">
      {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />)}
    </svg>
  )
}

// ── Manager PIN Modal ─────────────────────────────────────────────────────────
function ManagerPinModal({ onApprove, onClose }: { onApprove: (id: string, name: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleVerify() {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
    setLoading(true); setError('')

    const { data, error: dbErr } = await supabase
      .from('employees')
      .select('id, name, role, app_users(id, name, role)')
      .eq('pin', pin)
      .eq('is_active', true)
      .in('role', ['manager', 'owner'])
      .maybeSingle()

    setLoading(false)

    if (dbErr || !data) {
      setError('Invalid PIN or insufficient permissions')
      setPin('')
      return
    }

    const approverName = (data.app_users as any)?.name || data.name
    const appUserId = (data.app_users as any)?.id || data.id

    onApprove(appUserId, approverName)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Manager Approval</h3>
            <p className="text-xs text-gray-400">Enter manager PIN to continue</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <input type="password" inputMode="numeric" maxLength={8} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="••••" autoFocus
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
        />
        {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
            <button key={i} onClick={() => {
              if (k === '⌫') setPin(p => p.slice(0, -1))
              else if (k !== '') setPin(p => p.length < 8 ? p + k : p)
            }} className={`h-12 rounded-xl text-sm font-semibold transition-colors ${k === '' ? '' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleVerify} disabled={loading || pin.length < 4}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 transition-all">
            {loading ? 'Checking…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Transaction Modal ────────────────────────────────────────────────────
function EditTransactionModal({ receipt, currencySymbol, onClose, onSaved }: { receipt: any; currencySymbol: string; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [note, setNote] = useState(receipt.note || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('receipts').update({ note }).eq('id', receipt.id)
    setSaving(false)
    toast.success('Transaction updated')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Edit2 className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Edit Transaction #{receipt.receipt_number}</h3>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Total</label>
            <p className="text-sm font-semibold text-gray-800">{currencySymbol}{Number(receipt.total).toFixed(2)}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Note</label>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Add a note to this transaction…" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Void Type Modal ──────────────────────────────────────────────────────────
function VoidTypeModal({ onConfirm, onClose }: {
  onConfirm: (type: 'return_stock' | 'wastage') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-red-50">
          <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">How should stock be handled?</h3>
            <p className="text-xs text-gray-500">Choose void type before confirming</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-2.5">
          <button
            onClick={() => onConfirm('return_stock')}
            className="w-full text-left p-3.5 rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                <ArrowDownCircle className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700 transition-colors">Return to Stock</p>
                <p className="text-xs text-gray-500 mt-0.5">Refund sale and restore ingredients back to inventory. COGS entry removed.</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => onConfirm('wastage')}
            className="w-full text-left p-3.5 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                <ArrowUpCircle className="w-4 h-4 text-gray-400 group-hover:text-orange-600 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-700 transition-colors">Mark as Wastage</p>
                <p className="text-xs text-gray-500 mt-0.5">Refund sale but stock stays consumed. COGS kept — ingredients already used.</p>
              </div>
            </div>
          </button>
        </div>
        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helper: generate ref number from date + per-shift sequence ────────────────
function buildRefNumber(date: Date, sequence: number): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const y = String(date.getFullYear())
  return `${m}${d}${y}-${String(sequence).padStart(5, '0')}`
}

// ── Inner page ────────────────────────────────────────────────────────────────
function ShiftReportContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const shiftId = searchParams.get('shiftId') || ''
  const supabase = createClient()
  const { currencySymbol } = useShop()

  const [loading, setLoading] = useState(true)
  const [shift, setShift] = useState<any>(null)
  const [receipts, setReceipts] = useState<any[]>([])
  const [cashMovements, setCashMovements] = useState<any[]>([])
  const [receiptItems, setReceiptItems] = useState<Record<string, any[]>>({})

  const [pinAction, setPinAction] = useState<{ type: 'void' | 'edit' | 'reprint'; tx: any } | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [editReceipt, setEditReceipt] = useState<any | null>(null)
  const [voidPending, setVoidPending] = useState<{ tx: any; managerId: string; managerName: string } | null>(null)

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

  async function loadData() {
    if (!shiftId) return
    setLoading(true)

    const [shiftRes, receiptsRes, movementsRes] = await Promise.all([
      supabase.from('shifts').select('*, app_users(id, name, role)').eq('id', shiftId).single(),
      supabase.from('receipts')
        .select('*, app_users:employee_id(name), payment_types(name)')
        .eq('shift_id', shiftId)
        .order('created_at'),
      supabase.from('shift_cash_movements').select('*').eq('shift_id', shiftId).order('created_at'),
    ])

    const shiftData = shiftRes.data
    setShift(shiftData)
    const rxs = receiptsRes.data || []
    setReceipts(rxs)
    setCashMovements(movementsRes.data || [])

    if (rxs.length > 0) {
      const { data: items } = await supabase
        .from('receipt_items').select('*')
        .in('receipt_id', rxs.map((r: any) => r.id))
      const byReceipt: Record<string, any[]> = {}
      for (const item of items || []) {
        if (!byReceipt[item.receipt_id]) byReceipt[item.receipt_id] = []
        byReceipt[item.receipt_id].push(item)
      }
      setReceiptItems(byReceipt)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [shiftId])

  // ── Summaries ────────────────────────────────────────────────────────────────
  const activeReceipts = receipts.filter(r => r.status !== 'voided')
  const salesTotal = activeReceipts.reduce((s, r) => s + Number(r.total), 0)
  const cashIn = cashMovements.filter(m => m.type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0)
  const cashOut = cashMovements.filter(m => m.type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0)
  const openingCash = Number(shift?.opening_cash || 0)
  const cashSales = activeReceipts
    .filter(r => r.payment_types?.name?.toLowerCase() === 'cash' || !r.payment_type_id)
    .reduce((s, r) => s + Number(r.total), 0)
  const expectedCash = openingCash + cashIn - cashOut + cashSales

  const paymentBreakdown = activeReceipts.reduce((acc: Record<string, number>, r) => {
    const name = r.payment_types?.name || 'Cash'
    acc[name] = (acc[name] || 0) + Number(r.total)
    return acc
  }, {})
  const pieSegments = Object.entries(paymentBreakdown).map(([label, value], i) => ({
    label, value, color: COLORS[i % COLORS.length],
  }))
  pieSegments.push({ label: 'Cash In', value: cashIn, color: '#3b82f6' })

  // ── Build unified transaction timeline ────────────────────────────────────
  const sortedReceipts = [...receipts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const receiptRefMap: Record<string, string> = {}
  sortedReceipts.forEach((r, idx) => {
    receiptRefMap[r.id] = buildRefNumber(new Date(r.created_at), idx + 1)
  })

  const allTransactions = [
    ...receipts.map(r => ({
      ...r,
      _type: r.status === 'voided' ? 'refund' : 'sale',
      _time: new Date(r.created_at),
      _ref: receiptRefMap[r.id] || '—',
      _staff: r.app_users?.name || shift?.app_users?.name || '—',
    })),
    ...cashMovements.map(m => ({
      ...m,
      _type: m.type as 'cash_in' | 'cash_out',
      _time: new Date(m.created_at),
      _ref: '—',
      _staff: shift?.app_users?.name || '—',
    })),
  ].sort((a, b) => a._time.getTime() - b._time.getTime())

  // ── Action handlers ───────────────────────────────────────────────────────
  function requestAction(type: 'void' | 'edit' | 'reprint', tx: any) {
    setPinAction({ type, tx })
    setShowPin(true)
  }

  function handlePinApproved(managerId: string, managerName: string) {
    setShowPin(false)
    if (!pinAction) return
    const { type, tx } = pinAction
    if (type === 'void') setVoidPending({ tx, managerId, managerName })
    else if (type === 'edit') setEditReceipt(tx)
    else if (type === 'reprint') handleReprint(tx)
    setPinAction(null)
  }

  async function handleVoid(receipt: any, managerId: string, managerName: string, voidType: 'return_stock' | 'wastage') {
    const res = await fetch(`/api/transactions/${receipt.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_note: `Voided by ${managerName}`,
        void_type: voidType,
      }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Failed to void transaction'); return }
    const action = voidType === 'wastage' ? 'logged as wastage' : `${data.items_reverted} item(s) restocked`
    toast.success(`Transaction ${receipt._ref} voided — ${action}`)
    loadData()
  }

  function handleVoidTypeConfirmed(voidType: 'return_stock' | 'wastage') {
    if (!voidPending) return
    const { tx, managerId, managerName } = voidPending
    setVoidPending(null)
    handleVoid(tx, managerId, managerName, voidType)
  }

  function handleReprint(receipt: any) {
    const items = receiptItems[receipt.id] || []
    const line = '--------------------------------'
    const row = (l: string, r: string) => l + ' '.repeat(Math.max(1, 32 - l.length - r.length)) + r
    const lines = [
      `*** REPRINT ***`,
      `Ref: ${receipt._ref}`,
      new Date(receipt.created_at).toLocaleString(),
      line,
      ...items.map((i: any) => row(`${i.quantity}x ${i.item_name}`, `${currencySymbol}${Number(i.line_total).toFixed(2)}`)),
      line,
      row('Total', `${currencySymbol}${Number(receipt.total).toFixed(2)}`),
      row('Payment', receipt.payment_types?.name || 'Cash'),
      '',
    ]
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`<html><head><style>body{font-family:'Courier New',monospace;font-size:12px;white-space:pre;margin:16px}@media print{@page{margin:0}body{margin:8mm}}</style></head><body>${lines.join('\n').replace(/</g, '&lt;')}</body></html>`)
    win.document.close(); win.focus(); win.print()
    toast.success('Reprinting…')
  }

  if (!shiftId) {
    return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">No shift ID provided.</div>
  }

  return (
    <>
      {voidPending && (
        <VoidTypeModal
          onConfirm={handleVoidTypeConfirmed}
          onClose={() => setVoidPending(null)}
        />
      )}
      {showPin && (
        <ManagerPinModal
          onApprove={handlePinApproved}
          onClose={() => { setShowPin(false); setPinAction(null) }}
        />
      )}
      {editReceipt && (
        <EditTransactionModal
          receipt={editReceipt}
          currencySymbol={currencySymbol}
          onClose={() => setEditReceipt(null)}
          onSaved={loadData}
        />
      )}

      <div className="min-h-screen bg-gray-50 flex flex-col">

        {/* Header — compact for tablet */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">Shift Sales Report</h2>
              <p className="text-xs text-gray-400 truncate">
                {shift ? `${shift.app_users?.name || 'Unknown'} · ${new Date(shift.clock_in).toLocaleString()}` : 'Loading…'}
              </p>
            </div>
          </div>
          <button onClick={loadData} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading report…</div>
          ) : (
            <>
              {/* Summary cards — 2×2 on tablet, 4-col on desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Sales', value: salesTotal, icon: Receipt, bg: 'bg-indigo-50', text: 'text-indigo-600' },
                  { label: 'Expected Cash', value: expectedCash, icon: DollarSign, bg: 'bg-green-50', text: 'text-green-600' },
                  { label: 'Cash In', value: cashIn, icon: ArrowDownCircle, bg: 'bg-blue-50', text: 'text-blue-600' },
                  { label: 'Cash Out', value: cashOut, icon: ArrowUpCircle, bg: 'bg-orange-50', text: 'text-orange-600' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl p-3 border border-gray-200">
                    <div className={`w-7 h-7 ${card.bg} rounded-lg flex items-center justify-center mb-2`}>
                      <card.icon className={`w-3.5 h-3.5 ${card.text}`} />
                    </div>
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className={`text-sm sm:text-base font-bold ${card.text}`}>{currencySymbol}{card.value.toFixed(2)}</p>
                  </div>
                ))}
              </div>

              {/* Pie + breakdown — stacked on tablet, side-by-side on desktop */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Payment Breakdown</h3>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="flex-shrink-0 self-center sm:self-start">
                    <PieChart segments={pieSegments.filter(s => s.value > 0)} />
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    {pieSegments.filter(s => s.value > 0).map((seg, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-xs text-gray-700">{seg.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-gray-900">{currencySymbol}{seg.value.toFixed(2)}</span>
                          <span className="text-xs text-gray-400 ml-1.5">
                            {((seg.value / (salesTotal + cashIn || 1)) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-gray-100 pt-2 flex justify-between">
                      <span className="text-xs font-semibold text-gray-700">Opening Cash</span>
                      <span className="text-xs font-semibold text-gray-900">{currencySymbol}{openingCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-700">Transactions</span>
                      <span className="text-xs font-semibold text-gray-900">{activeReceipts.length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions Table — horizontally scrollable on tablet */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Shift Transactions</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 sm:hidden">← scroll →</span>
                    <span className="text-xs text-gray-400">{allTransactions.length} entries</span>
                  </div>
                </div>

                <div className="overflow-auto" style={{ maxHeight: '420px' }}>
                  <table className="w-full text-xs min-w-[580px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Time</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Ref #</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Type</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Items / Note</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap hidden sm:table-cell">Staff</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Amount</th>
                        <th className="sticky top-0 bg-gray-50 z-10 text-center px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTransactions.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-10 text-gray-400">No transactions yet</td></tr>
                      )}
                      {allTransactions.map((tx) => {
                        const isSale   = tx._type === 'sale'
                        const isRefund = tx._type === 'refund'
                        const isCashIn = tx._type === 'cash_in'
                        const isCashOut = tx._type === 'cash_out'

                        const isPositive = isSale || isCashIn
                        const amountColor = isPositive ? 'text-green-600' : 'text-red-500'
                        const amountPrefix = isPositive ? '+' : '-'
                        const amountValue = Number(tx.total ?? tx.amount ?? 0)

                        return (
                          <tr key={`${tx._type}-${tx.id}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                              {tx._time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                              {tx._ref}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isSale && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                  <Receipt className="w-2.5 h-2.5" /> Sale
                                </span>
                              )}
                              {isRefund && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                  <Ban className="w-2.5 h-2.5" /> Refund
                                </span>
                              )}
                              {isCashIn && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                  <ArrowDownCircle className="w-2.5 h-2.5" /> Cash In
                                </span>
                              )}
                              {isCashOut && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                  <ArrowUpCircle className="w-2.5 h-2.5" /> Cash Out
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[160px]">
                              {(isSale || isRefund) ? (
                                <div className="space-y-0.5">
                                  {(receiptItems[tx.id] || []).map((it: any, j: number) => (
                                    <div key={j} className="truncate">{it.quantity}× {it.item_name}</div>
                                  ))}
                                  {tx.note && <div className="text-amber-600 truncate">📝 {tx.note}</div>}
                                  {isRefund && tx.void_note && <div className="text-red-400 truncate text-[10px]">{tx.void_note}</div>}
                                </div>
                              ) : (
                                <span className="text-gray-400">{tx.note || '—'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap hidden sm:table-cell">
                              {tx._staff}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${amountColor}`}>
                              {amountPrefix}{currencySymbol}{amountValue.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-0.5">
                                {isSale && (
                                  <>
                                    <button onClick={() => requestAction('reprint', tx)} title="Reprint (manager PIN)"
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => requestAction('edit', tx)} title="Edit (manager PIN)"
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => requestAction('void', tx)} title="Void (manager PIN)"
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                {isRefund && (
                                  <button onClick={() => requestAction('reprint', tx)} title="Reprint void receipt (manager PIN)"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(isCashIn || isCashOut) && (
                                  <span className="text-gray-300 text-xs px-2">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function ShiftReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <ShiftReportContent />
    </Suspense>
  )
}
