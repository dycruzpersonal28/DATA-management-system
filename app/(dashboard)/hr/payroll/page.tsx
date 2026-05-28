'use client'

// /app/(dashboard)/hr/payroll/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  Unlock,
  Trash2,
  Printer,
  RefreshCw,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  Edit3,
  X,
  Check,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollPeriod {
  id: string
  period_start: string
  period_end: string
  cutoff: string | null
  status: 'draft' | 'finalized'
  created_at: string
  payslip_count: number
  total_net_pay: number
  finalized_count: number
}

interface Employee {
  id: string
  name: string
  email: string
  employee_no: string | null
  employment_type: string | null
  hourly_rate: number
  allowance: number
  role: string
}

interface Payslip {
  id: string
  employee_id: string
  period_id: string
  basic_pay: number
  overtime_pay: number
  allowance: number
  late_deduction: number
  sss_contribution: number
  philhealth_contribution: number
  pagibig_contribution: number
  tax_withheld: number
  net_pay: number
  status: 'draft' | 'finalized'
  employees: Employee
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const fmtDate = (d: string) => {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ status }: { status: 'draft' | 'finalized' }) {
  return status === 'finalized' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Finalized
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
      <Edit3 className="w-3 h-3" /> Draft
    </span>
  )
}

// ─── Editable field ───────────────────────────────────────────────────────────

function EditableAmount({
  value,
  label,
  onChange,
  disabled,
}: {
  value: number
  label: string
  onChange: (v: number) => void
  disabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toString())

  const commit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onChange(parsed)
    setEditing(false)
  }

  if (disabled) {
    return <span className="text-sm text-gray-800">{fmt(value)}</span>
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          step="0.01"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-28 px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button onClick={commit} className="text-blue-600 hover:text-blue-800"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value.toString()); setEditing(true) }}
      className="text-sm text-gray-800 hover:text-blue-700 hover:underline decoration-dashed underline-offset-2 transition-colors"
      title={`Edit ${label}`}
    >
      {fmt(value)}
    </button>
  )
}

// ─── Payslip row ──────────────────────────────────────────────────────────────

function PayslipRow({
  slip,
  onUpdate,
  onPrint,
}: {
  slip: Payslip
  onUpdate: (payslip_id: string, updates: Partial<Payslip>) => Promise<void>
  onPrint: (slip: Payslip) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const isFinalized = slip.status === 'finalized'

  const handleChange = async (field: keyof Payslip, value: number) => {
    setSaving(true)
    await onUpdate(slip.id, { [field]: value })
    setSaving(false)
  }

  const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
  const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${isFinalized ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
      {/* Row header */}
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{slip.employees.name}</p>
          <p className="text-xs text-gray-500">{slip.employees.role} {slip.employees.employee_no ? `· #${slip.employees.employee_no}` : ''}</p>
        </div>

        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-xs text-gray-400">Gross</p>
            <p className="font-medium text-gray-700">{fmt(gross)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Deductions</p>
            <p className="font-medium text-red-600">–{fmt(deductions)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Net Pay</p>
            <p className="font-semibold text-gray-900 text-base">{fmt(slip.net_pay)}</p>
          </div>
        </div>

        {/* Mobile net pay */}
        <div className="sm:hidden text-right">
          <p className="font-semibold text-gray-900">{fmt(slip.net_pay)}</p>
        </div>

        {saving && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />}
        <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Earnings</p>
              <div className="space-y-2">
                {[
                  ['Basic Pay', 'basic_pay'],
                  ['Overtime Pay', 'overtime_pay'],
                  ['Allowance', 'allowance'],
                ].map(([label, field]) => (
                  <div key={field} className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{label}</span>
                    <EditableAmount
                      label={label}
                      value={(slip as any)[field]}
                      disabled={isFinalized}
                      onChange={v => handleChange(field as keyof Payslip, v)}
                    />
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-dashed border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Gross Pay</span>
                  <span className="text-sm font-semibold text-gray-900">{fmt(gross)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Deductions</p>
              <div className="space-y-2">
                {[
                  ['Late Deduction', 'late_deduction'],
                  ['SSS', 'sss_contribution'],
                  ['PhilHealth', 'philhealth_contribution'],
                  ['Pag-IBIG', 'pagibig_contribution'],
                  ['Withholding Tax', 'tax_withheld'],
                ].map(([label, field]) => (
                  <div key={field} className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{label}</span>
                    <EditableAmount
                      label={label}
                      value={(slip as any)[field]}
                      disabled={isFinalized}
                      onChange={v => handleChange(field as keyof Payslip, v)}
                    />
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-dashed border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Total Deductions</span>
                  <span className="text-sm font-semibold text-red-600">–{fmt(deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net pay + print */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div>
              <span className="text-sm text-gray-500 mr-2">Net Pay</span>
              <span className="text-lg font-bold text-gray-900">{fmt(slip.net_pay)}</span>
            </div>
            <div className="flex items-center gap-2">
              {isFinalized && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Finalized
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onPrint(slip) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print Payslip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Print payslip (opens new window) ────────────────────────────────────────

function printPayslip(slip: Payslip, period: PayrollPeriod) {
  const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
  const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Payslip — ${slip.employees.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; max-width: 480px; margin: 0 auto; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .period { font-size: 11px; color: #666; margin-bottom: 24px; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 600; margin: 16px 0 6px; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
    .row.total { border-bottom: 2px solid #111; font-weight: 700; padding-top: 8px; margin-top: 4px; }
    .net { display: flex; justify-content: space-between; padding: 12px 0; font-size: 16px; font-weight: 700; border-top: 2px solid #111; margin-top: 8px; }
    .employee { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e0e0e0; }
    .employee p { margin: 2px 0; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>PAYSLIP</h1>
  <p class="period">${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}</p>
  <div class="employee">
    <p><strong>${slip.employees.name}</strong></p>
    ${slip.employees.employee_no ? `<p>Employee #${slip.employees.employee_no}</p>` : ''}
    <p>${slip.employees.role}</p>
    ${slip.employees.employment_type ? `<p>${slip.employees.employment_type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>` : ''}
  </div>
  <p class="section-title">Earnings</p>
  <div class="row"><span>Basic Pay</span><span>${fmt(slip.basic_pay)}</span></div>
  ${slip.overtime_pay > 0 ? `<div class="row"><span>Overtime Pay</span><span>${fmt(slip.overtime_pay)}</span></div>` : ''}
  ${slip.allowance > 0 ? `<div class="row"><span>Allowance</span><span>${fmt(slip.allowance)}</span></div>` : ''}
  <div class="row total"><span>Gross Pay</span><span>${fmt(gross)}</span></div>
  <p class="section-title">Deductions</p>
  ${slip.late_deduction > 0 ? `<div class="row"><span>Late Deduction</span><span>–${fmt(slip.late_deduction)}</span></div>` : ''}
  <div class="row"><span>SSS</span><span>–${fmt(slip.sss_contribution)}</span></div>
  <div class="row"><span>PhilHealth</span><span>–${fmt(slip.philhealth_contribution)}</span></div>
  <div class="row"><span>Pag-IBIG</span><span>–${fmt(slip.pagibig_contribution)}</span></div>
  ${slip.tax_withheld > 0 ? `<div class="row"><span>Withholding Tax</span><span>–${fmt(slip.tax_withheld)}</span></div>` : ''}
  <div class="row total"><span>Total Deductions</span><span>–${fmt(deductions)}</span></div>
  <div class="net"><span>NET PAY</span><span>${fmt(slip.net_pay)}</span></div>
  <p style="margin-top:32px;font-size:10px;color:#aaa;">Generated ${new Date().toLocaleString('en-PH')}</p>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }
}

// ─── Create Period Modal ───────────────────────────────────────────────────────

function CreatePeriodModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: { period_start: string; period_end: string }) => Promise<void>
}) {
  const today = new Date()
  const day = today.getDate()

  const defaultStart = day <= 15
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-16`

  const defaultEnd = day <= 15
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`
    : new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const [form, setForm] = useState({ period_start: defaultStart, period_end: defaultEnd })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!form.period_start || !form.period_end) return
    setLoading(true)
    await onCreate(form)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create Payroll Period</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period Start</label>
              <input
                type="date"
                value={form.period_start}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period End</label>
              <input
                type="date"
                value={form.period_end}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Draft payslips will be auto-generated from time logs for all active employees in this date range. You can edit each payslip before finalizing.</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate Payslips
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null)
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [loadingPayslips, setLoadingPayslips] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true)
    try {
      const res = await fetch('/api/payroll')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPeriods(data.periods ?? [])
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payroll periods')
    } finally {
      setLoadingPeriods(false)
    }
  }, [])

  const fetchPayslips = useCallback(async (period_id: string) => {
    setLoadingPayslips(true)
    try {
      const res = await fetch(`/api/payroll?period_id=${period_id}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPayslips(data.payslips ?? [])
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payslips')
    } finally {
      setLoadingPayslips(false)
    }
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])

  useEffect(() => {
    if (selectedPeriod) fetchPayslips(selectedPeriod.id)
    else setPayslips([])
  }, [selectedPeriod, fetchPayslips])

  const handleCreatePeriod = async (formData: { period_start: string; period_end: string }) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_period', ...formData }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(`Payroll period created with ${data.payslips?.length ?? 0} payslips`)
      setShowCreateModal(false)
      await fetchPeriods()
      if (data.period) setSelectedPeriod(data.period)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create period')
    }
  }

  const handleUpdatePayslip = async (payslip_id: string, updates: Partial<Payslip>) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payslip', payslip_id, updates }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPayslips(prev => prev.map(s => s.id === payslip_id ? { ...s, ...data.payslip } : s))
      fetchPeriods()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update payslip')
    }
  }

  const handleFinalize = async () => {
    if (!selectedPeriod) return
    if (!confirm('Finalize this payroll period? All payslips will be locked and cannot be edited.')) return
    setFinalizing(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize_period', period_id: selectedPeriod.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Payroll period finalized')
      const updated = { ...selectedPeriod, status: 'finalized' as const }
      setSelectedPeriod(updated)
      await fetchPeriods()
      await fetchPayslips(selectedPeriod.id)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to finalize')
    } finally {
      setFinalizing(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedPeriod) return
    if (!confirm('Delete this draft payroll period? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/payroll?period_id=${selectedPeriod.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Period deleted')
      setSelectedPeriod(null)
      await fetchPeriods()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete period')
    } finally {
      setDeleting(false)
    }
  }

  const totalGross = payslips.reduce((s, p) => s + p.basic_pay + p.overtime_pay + p.allowance, 0)
  const totalDeductions = payslips.reduce((s, p) => s + p.late_deduction + p.sss_contribution + p.philhealth_contribution + p.pagibig_contribution + p.tax_withheld, 0)
  const totalNet = payslips.reduce((s, p) => s + p.net_pay, 0)

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left sidebar: period list ─────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Payroll Periods</h2>
            <p className="text-xs text-gray-400 mt-0.5">{periods.length} period{periods.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loadingPeriods ? (
            <div className="flex items-center justify-center h-24 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
          ) : periods.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No payroll periods yet.
              <br />Click + New to get started.
            </div>
          ) : (
            periods.map(period => (
              <button
                key={period.id}
                onClick={() => setSelectedPeriod(period)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${selectedPeriod?.id === period.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {`${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDate(period.period_start)} – {fmtDate(period.period_end)}
                    </p>
                  </div>
                  <Badge status={period.status} />
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Users className="w-3 h-3" />{period.payslip_count}</span>
                  <span className="text-xs font-medium text-gray-700">{fmt(period.total_net_pay)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!selectedPeriod ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">Select a payroll period</p>
              <p className="text-sm text-gray-400 mt-1">Or create a new one to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Create Payroll Period
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Period header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold text-gray-900">
                      {`${fmtDate(selectedPeriod.period_start)} – ${fmtDate(selectedPeriod.period_end)}`}
                    </h1>
                    <Badge status={selectedPeriod.status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {fmtDate(selectedPeriod.period_start)} – {fmtDate(selectedPeriod.period_end)}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={`/hr/payroll/${selectedPeriod.id}/payslip`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> View Payslips
                  </a>
                  {selectedPeriod.status === 'draft' && (
                    <>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                      <button
                        onClick={handleFinalize}
                        disabled={finalizing || payslips.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {finalizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        Finalize Payroll
                      </button>
                    </>
                  )}
                  {selectedPeriod.status === 'finalized' && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 bg-emerald-50 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Payroll Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Summary stats */}
              {payslips.length > 0 && (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  {[
                    { label: 'Employees', value: payslips.length.toString() },
                    { label: 'Total Gross', value: fmt(totalGross) },
                    { label: 'Deductions', value: `–${fmt(totalDeductions)}` },
                    { label: 'Total Net Pay', value: fmt(totalNet), highlight: true },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className={`rounded-xl px-4 py-3 ${highlight ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-100'}`}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-base font-semibold mt-0.5 ${highlight ? 'text-white' : 'text-gray-900'}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payslip list */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingPayslips ? (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading payslips…
                </div>
              ) : payslips.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No payslips found</p>
                  <p className="text-sm mt-1">No active employees had time logs in this period</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-3xl">
                  {selectedPeriod.status === 'draft' && (
                    <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      <Unlock className="w-3.5 h-3.5 flex-shrink-0" />
                      Click any payslip to expand it. Tap any amount to edit it. Finalize when ready to lock.
                    </div>
                  )}
                  {payslips.map(slip => (
                    <PayslipRow
                      key={slip.id}
                      slip={slip}
                      onUpdate={handleUpdatePayslip}
                      onPrint={s => printPayslip(s, selectedPeriod)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showCreateModal && (
        <CreatePeriodModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePeriod}
        />
      )}
    </div>
  )
}