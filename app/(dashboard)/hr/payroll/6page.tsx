'use client'

// /app/(dashboard)/hr/payroll/page.tsx

import { useState, useEffect, useCallback } from 'react'

import { toast } from 'sonner'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Lock,
  Trash2, Printer, RefreshCw, Users, Clock, AlertCircle,
  CheckCircle2, Edit3, X, Check, Settings, CalendarDays,
  Save, ChevronDown, UserPlus, LayoutTemplate, Download,
  Building2, Palette, Eye, EyeOff, FileDown, Pencil,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollPeriod {
  id: string
  period_start: string
  period_end: string
  cutoff: string | null
  status: string
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
  other_deductions: { id: string; label: string; amount: number }[]
  status: 'draft' | 'released'
  employees: Employee
}

interface TimeLog {
  id: string
  employee_id: string
  clock_in: string
  clock_out: string | null
  total_hours: number | null
  late_minutes: number | null
  overtime_hours: number | null
  shift_schedule_id?: string
  notes?: string
  advances?: { id: string; label: string; amount: number }[]
  employees?: { name: string; role: string; employee_no: string | null }
}

interface PayrollSettings {
  late_deduction_per_minute: number
  late_deduction_type?: 'flat' | 'per_minute'
  late_deduction_flat_amount?: number
  shop_timezone?: string
  sss_rate: number
  philhealth_rate: number
  pagibig_flat: number
  overtime_multiplier: number
  tax_rate: number
  payslip_notes?: string
  break_mode?: 'auto' | 'manual'
  break_duration_minutes?: number
  kiosk_mode?: 'show_all' | 'pin_first'
}

interface ShiftSchedule {
  id: string
  name: string
  start_time: string   // e.g. "08:00"
  end_time: string     // e.g. "17:00"
}

// ─── Other Deductions ─────────────────────────────────────────────────────────


// ─── Payslip Template ─────────────────────────────────────────────────────────

interface PayslipTemplate {
  id: string
  name: string
  companyName: string
  companyAddress: string
  primaryColor: string
  showEmployeeNo: boolean
  showOvertimePay: boolean
  showAllowance: boolean
  showLateDeduction: boolean
  showSSS: boolean
  showPhilHealth: boolean
  showPagibig: boolean
  showTax: boolean
  footerNote: string
  logoUrl: string
  createdAt: string
}

const TEMPLATES_KEY = 'payslip_templates_v1'
const PERIOD_TEMPLATE_KEY = 'payslip_period_template_map_v1'

function loadTemplates(): PayslipTemplate[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') } catch { return [] }
}

function saveTemplates(templates: PayslipTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

function savePeriodTemplate(periodId: string, templateId: string) {
  const map: Record<string, string> = JSON.parse(localStorage.getItem(PERIOD_TEMPLATE_KEY) ?? '{}')
  map[periodId] = templateId
  localStorage.setItem(PERIOD_TEMPLATE_KEY, JSON.stringify(map))
}

function getTemplateForPeriod(periodId: string): PayslipTemplate | null {
  try {
    const map: Record<string, string> = JSON.parse(localStorage.getItem(PERIOD_TEMPLATE_KEY) ?? '{}')
    const templateId = map[periodId]
    if (!templateId) return null
    const all = loadTemplates()
    return all.find(t => t.id === templateId) ?? null
  } catch { return null }
}

const PRESET_COLORS = [
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Slate', value: '#334155' },
]

const DEFAULT_TEMPLATE: Omit<PayslipTemplate, 'id' | 'name' | 'createdAt'> = {
  companyName: '',
  companyAddress: '',
  primaryColor: '#4f46e5',
  showEmployeeNo: true,
  showOvertimePay: true,
  showAllowance: true,
  showLateDeduction: true,
  showSSS: true,
  showPhilHealth: true,
  showPagibig: true,
  showTax: true,
  footerNote: '',
  logoUrl: '/Capture.jpg',
}

// ─── Safe JSON fetch helper ───────────────────────────────────────────────────
// Prevents "Unexpected token '<'" crash when an API route returns HTML (404 page)

async function safeJson(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // Route returned HTML — likely a missing API route
    console.warn(`API ${res.url} returned non-JSON (status ${res.status}). Response: ${text.slice(0, 120)}`)
    return { error: `API route not found (${res.status}). Check that this route exists on your server.` }
  }
}

// ─── Late fee journal entry helpers ──────────────────────────────────────────
// Posts a journal entry to financial_entries whenever a payslip with a
// late_deduction > 0 is saved or finalized. Uses reference_type:'payslip' +
// reference_id so the finance cleanup route can auto-reverse it when the
// payslip is voided/deleted.

async function postLateFeeJournalEntry({
  payslipId,
  employeeName,
  amount,
  periodStart,
  periodEnd,
}: {
  payslipId: string
  employeeName: string
  amount: number
  periodStart: string
  periodEnd: string
}) {
  if (amount <= 0) return
  try {
    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'other_income',
        category: 'other_income',
        amount,
        entry_date: periodEnd,
        description: `Late fee penalty — ${employeeName} (${periodStart} to ${periodEnd})`,
        notes: 'Late fee penalties',
        reference_type: 'payslip',
        reference_id: payslipId,
      }),
    })
  } catch {
    // Non-critical — payslip save already succeeded; finance entry is best-effort
    console.warn('Failed to post late fee journal entry')
  }
}

async function deleteLateFeeJournalEntry(payslipId: string) {
  try {
    await fetch(`/api/finance?reference_type=payslip&reference_id=${payslipId}`, {
      method: 'DELETE',
    })
  } catch {
    console.warn('Failed to delete late fee journal entry')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const fmtDate = (d: string) => {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

const fmtTime = (iso: string, tz = 'Asia/Manila') =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
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

// ─── Editable Amount ──────────────────────────────────────────────────────────

function EditableAmount({ value, label, onChange, disabled }: {
  value: number; label: string; onChange: (v: number) => void; disabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toString())

  const commit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onChange(parsed)
    setEditing(false)
  }

  if (disabled) return <span className="text-sm text-gray-800">{fmt(value)}</span>
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input autoFocus type="number" step="0.01" value={draft}
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
    <button onClick={() => { setDraft(value.toString()); setEditing(true) }}
      className="text-sm text-gray-800 hover:text-blue-700 hover:underline decoration-dashed underline-offset-2 transition-colors"
      title={`Edit ${label}`}
    >
      {fmt(value)}
    </button>
  )
}

// ─── Payslip Row ──────────────────────────────────────────────────────────────

function PayslipRow({ slip, onUpdate, onPrint, onVoid, onFinalize, selected, onToggleSelect }: {
  slip: Payslip
  onUpdate: (id: string, updates: Partial<Payslip>) => Promise<void>
  onPrint: (slip: Payslip) => void
  onVoid?: (id: string) => Promise<void>
  onFinalize?: (id: string) => Promise<void>
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const isFinalized = slip.status === 'released'

  const handleVoid = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onVoid) return
    const msg = isFinalized
      ? `Void payslip for ${slip.employees.name}? This will delete it and remove all related financial entries.`
      : `Delete this draft payslip for ${slip.employees.name}? This cannot be undone.`
    if (!confirm(msg)) return
    setVoiding(true)
    await onVoid(slip.id)
    // Reverse the late fee journal entry now that the payslip is voided
    await deleteLateFeeJournalEntry(slip.id)
    setVoiding(false)
  }

  const handleFinalizeClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onFinalize) return
    setFinalizing(true)
    await onFinalize(slip.id)
    setFinalizing(false)
  }

  // Per-payslip other deductions (stored in DB on the payslip itself)
  const otherDeductions: { id: string; label: string; amount: number }[] = slip.other_deductions ?? []

  const handleChange = async (field: keyof Payslip, value: number) => {
    setSaving(true)
    await onUpdate(slip.id, { [field]: value })
    setSaving(false)
  }

  const handleOtherChange = async (updated: { id: string; label: string; amount: number }[]) => {
    setSaving(true)
    await onUpdate(slip.id, { other_deductions: updated } as any)
    setSaving(false)
  }

  const addOtherDeduction = () => {
    const updated = [...otherDeductions, { id: crypto.randomUUID(), label: '', amount: 0 }]
    handleOtherChange(updated)
  }

  const updateOtherDeduction = (id: string, patch: Partial<{ label: string; amount: number }>) => {
    const updated = otherDeductions.map(o => o.id === id ? { ...o, ...patch } : o)
    handleOtherChange(updated)
  }

  const removeOtherDeduction = (id: string) => {
    const updated = otherDeductions.filter(o => o.id !== id)
    handleOtherChange(updated)
  }

  const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
  const otherTotal = otherDeductions.reduce((sum, o) => sum + (o.amount ?? 0), 0)
  const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld + otherTotal

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${selected ? 'ring-2 ring-red-300' : ''} ${isFinalized ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors" onClick={() => setExpanded(v => !v)}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onClick={e => e.stopPropagation()}
            onChange={() => onToggleSelect(slip.id)}
            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{slip.employees.name}</p>
          <p className="text-xs text-gray-500">{slip.employees.role}{slip.employees.employee_no ? ` · #${slip.employees.employee_no}` : ''}</p>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-right"><p className="text-xs text-gray-400">Gross</p><p className="font-medium text-gray-700">{fmt(gross)}</p></div>
          <div className="text-right"><p className="text-xs text-gray-400">Deductions</p><p className="font-medium text-red-600">–{fmt(deductions)}</p></div>
          <div className="text-right"><p className="text-xs text-gray-400">Net Pay</p><p className="font-semibold text-gray-900 text-base">{fmt(slip.net_pay)}</p></div>
        </div>
        <div className="sm:hidden text-right"><p className="font-semibold text-gray-900">{fmt(slip.net_pay)}</p></div>
        {saving && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />}
        <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Earnings</p>
              <div className="space-y-2">
                {[['Basic Pay','basic_pay'],['Overtime Pay','overtime_pay'],['Allowance','allowance']].map(([label, field]) => (
                  <div key={field} className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{label}</span>
                    <EditableAmount label={label} value={(slip as any)[field]} disabled={isFinalized} onChange={v => handleChange(field as keyof Payslip, v)} />
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-dashed border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Gross Pay</span>
                  <span className="text-sm font-semibold text-gray-900">{fmt(gross)}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Deductions</p>
              <div className="space-y-2">
                {[['Late Deduction','late_deduction'],['SSS','sss_contribution'],['PhilHealth','philhealth_contribution'],['Pag-IBIG','pagibig_contribution'],['Withholding Tax','tax_withheld']].map(([label, field]) => (
                  <div key={field} className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{label}</span>
                    <EditableAmount label={label} value={(slip as any)[field]} disabled={isFinalized} onChange={v => handleChange(field as keyof Payslip, v)} />
                  </div>
                ))}
                {/* Other deductions — always shown, editable when draft */}
                <div className="border-t border-dashed border-gray-100 pt-2 mt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Other Deductions</span>
                    {!isFinalized && (
                      <button onClick={addOtherDeduction}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )}
                  </div>
                  {otherDeductions.length === 0 ? (
                    <p className="text-xs text-gray-400 italic mb-1">
                      {isFinalized ? 'None' : 'No extra deductions — click Add to include one.'}
                    </p>
                  ) : (
                    otherDeductions.map(o => (
                      <div key={o.id} className="flex items-center gap-2 mb-1.5">
                        {isFinalized ? (
                          <>
                            <span className="flex-1 text-sm text-gray-500">{o.label || '—'}</span>
                            <span className="text-sm text-gray-800">–{fmt(o.amount)}</span>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={o.label}
                              onChange={e => updateOtherDeduction(o.id, { label: e.target.value })}
                              placeholder="Deduction name…"
                              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">₱</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={o.amount}
                                onChange={e => updateOtherDeduction(o.id, { amount: parseFloat(e.target.value) || 0 })}
                                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-right"
                              />
                            </div>
                            <button onClick={() => removeOtherDeduction(o.id)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between items-center border-t border-dashed border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Total Deductions</span>
                  <span className="text-sm font-semibold text-red-600">–{fmt(deductions)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div>
              <span className="text-sm text-gray-500 mr-2">Net Pay</span>
              <span className="text-lg font-bold text-gray-900">{fmt(slip.net_pay)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isFinalized && <span className="text-xs text-emerald-600 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalized</span>}
              {isFinalized && (
                <button
                  onClick={async e => {
                    e.stopPropagation()
                    if (!confirm('Unlock this payslip for editing? It will be set back to draft status.')) return
                    setSaving(true)
                    await onUpdate(slip.id, { status: 'draft' } as any)
                    setSaving(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Unlock & Edit
                </button>
              )}
              {!isFinalized && onFinalize && (
                <button onClick={handleFinalizeClick} disabled={finalizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                  {finalizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Finalize
                </button>
              )}
              {onVoid && (
                <button onClick={handleVoid} disabled={voiding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                  {voiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} {isFinalized ? 'Void' : 'Delete'}
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); onPrint(slip) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print Payslip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Print Payslip ────────────────────────────────────────────────────────────

function printPayslip(slip: Payslip, period: PayrollPeriod, tpl: PayslipTemplate | null = null, lateLogs?: { date: string; minutes: number }[], payslipNotes?: string, shopTimezone = 'Asia/Manila', allLogs?: { date: string; shift_name?: string; clock_in: string; clock_out: string | null; total_hours: number | null; late_minutes: number | null }[]) {
  const otherDeductions = (slip.other_deductions ?? []).filter(o => o.label.trim() && o.amount > 0)

  const color       = tpl?.primaryColor   ?? '#4f46e5'
  const companyName = tpl?.companyName    ?? ''
  const companyAddr = tpl?.companyAddress ?? ''
  const footerNote  = tpl?.footerNote     ?? ''
  const logoUrl     = tpl?.logoUrl        ?? ''
  const showEmpNo   = tpl ? tpl.showEmployeeNo    : true
  const showOT      = tpl ? tpl.showOvertimePay   : true
  const showAllow   = tpl ? tpl.showAllowance      : true
  const showLate    = tpl ? tpl.showLateDeduction  : true
  const showSSS     = tpl ? tpl.showSSS            : true
  const showPH      = tpl ? tpl.showPhilHealth     : true
  const showPagibig = tpl ? tpl.showPagibig        : true
  const showTax     = tpl ? tpl.showTax            : true

  const gross      = slip.basic_pay + slip.overtime_pay + slip.allowance
  const otherTotal = otherDeductions.reduce((sum, o) => sum + o.amount, 0)
  const deductions = slip.late_deduction + slip.sss_contribution
                   + slip.philhealth_contribution + slip.pagibig_contribution
                   + slip.tax_withheld + otherTotal

  const sortedLogs     = (allLogs ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const totalDays      = sortedLogs.length
  const totalHoursAll  = sortedLogs.reduce((s, l) => s + (l.total_hours ?? 0), 0)
  const lateDayCount   = sortedLogs.filter(l => (l.late_minutes ?? 0) > 0).length
  const totalLateMin   = sortedLogs.reduce((s, l) => s + (l.late_minutes ?? 0), 0)

  const fmtT = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: shopTimezone, hour: '2-digit', minute: '2-digit' }) }
    catch { return '—' }
  }

  const DSHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MSHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const attendanceRows = sortedLogs.map(l => {
    const late = (l.late_minutes ?? 0) > 0
    const [yr, mo, dy] = l.date.split('-').map(Number)
    const label = `${DSHORT[new Date(yr, mo-1, dy).getDay()]}, ${MSHORT[mo-1]} ${dy}`
    return `<tr${late ? ' class="lt"' : ''}>
      <td>${label}</td><td>${l.shift_name || '—'}</td>
      <td>${fmtT(l.clock_in)}</td><td>${l.clock_out ? fmtT(l.clock_out) : '—'}</td>
      <td class="r">${l.total_hours != null ? l.total_hours.toFixed(1)+'h' : '—'}</td>
      <td class="r">${late ? `<span class="lp">${l.late_minutes}m</span>` : '✓'}</td>
    </tr>`
  }).join('')

  const shiftMap: Record<string, { days: number; hrs: number; lateMin: number }> = {}
  for (const l of sortedLogs) {
    const k = l.shift_name || 'Unassigned'
    if (!shiftMap[k]) shiftMap[k] = { days: 0, hrs: 0, lateMin: 0 }
    shiftMap[k].days++
    shiftMap[k].hrs += l.total_hours ?? 0
    shiftMap[k].lateMin += l.late_minutes ?? 0
  }
  const shiftRows = Object.entries(shiftMap).map(([n, v]) =>
    `<tr><td>${n}</td><td class="r">${v.days}d</td><td class="r">${v.hrs.toFixed(1)}h</td><td class="r">${v.lateMin > 0 ? `<span class="lp">${v.lateMin}m late</span>` : '✓'}</td></tr>`
  ).join('')

  const logoTag = logoUrl ? `<img src="${logoUrl}" style="height:38px;object-fit:contain;display:block;margin-bottom:3px" onerror="this.style.display='none'" />` : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payslip</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9.5px;color:#222;padding:22px 28px;max-width:600px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${color};padding-bottom:8px;margin-bottom:10px}
  .hdr-left .co{font-size:11px;font-weight:700;color:#111}
  .hdr-left .addr{font-size:8.5px;color:#888;margin-top:1px}
  .hdr-left .title{font-size:16px;font-weight:800;color:${color};letter-spacing:-.3px;margin-top:4px}
  .hdr-left .period{font-size:8px;color:#999;margin-top:1px}
  .hdr-right{text-align:right;line-height:1.5}
  .hdr-right .name{font-size:11px;font-weight:700;color:#111}
  .hdr-right .sub{font-size:8.5px;color:#777}
  .stats{display:flex;gap:0;margin-bottom:10px}
  .stat{flex:1;text-align:center;padding:5px 4px;border-right:1px solid #eee}
  .stat:last-child{border-right:none}
  .stat .v{font-size:12px;font-weight:700;color:#111}
  .stat .l{font-size:7.5px;text-transform:uppercase;color:#aaa;margin-top:1px;letter-spacing:.04em}
  .stat.red .v{color:#dc2626}
  .cols{display:flex;gap:16px;margin-bottom:8px}
  .col{flex:1}
  .sec{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${color};border-bottom:1px solid ${color};padding-bottom:2px;margin-bottom:4px;margin-top:8px}
  .row{display:flex;justify-content:space-between;padding:2px 0;font-size:9px;border-bottom:1px solid #f5f5f5}
  .row span:first-child{color:#555}
  .row.tot{font-weight:700;font-size:9.5px;border-top:1px solid #ddd;border-bottom:none;padding-top:4px;margin-top:2px}
  .net{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${color};color:#fff;margin:8px 0}
  .net .nl{font-size:8.5px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;opacity:.85}
  .net .na{font-size:16px;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:8.5px;margin-top:4px}
  th{font-size:7.5px;text-transform:uppercase;letter-spacing:.05em;color:#999;font-weight:700;padding:3px 4px;text-align:left;border-bottom:1px solid #eee}
  td{padding:2.5px 4px;border-bottom:1px solid #f8f8f8;color:#444;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr.lt td{color:#b91c1c}
  .r{text-align:right}
  .lp{background:#fee2e2;color:#b91c1c;padding:0 4px;border-radius:6px;font-size:7.5px;font-weight:700}
  .notes{margin-top:8px;padding:6px 8px;background:#fafafa;border-left:2px solid ${color};font-size:8.5px;color:#555;white-space:pre-wrap;line-height:1.5}
  .foot{margin-top:10px;padding-top:6px;border-top:1px solid #eee;font-size:7.5px;color:#bbb;display:flex;justify-content:space-between}
  @media print{body{padding:14px 18px}@page{margin:.8cm;size:A4}}
</style></head><body>

<div class="hdr">
  <div class="hdr-left">
    ${logoTag}
    ${companyName ? `<div class="co">${companyName}</div>` : ''}
    ${companyAddr ? `<div class="addr">${companyAddr}</div>` : ''}
    <div class="title">PAYSLIP</div>
    <div class="period">${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}</div>
  </div>
  <div class="hdr-right">
    <div class="name">${slip.employees.name}</div>
    <div class="sub">${slip.employees.role}</div>
    ${showEmpNo && slip.employees.employee_no ? `<div class="sub">#${slip.employees.employee_no}</div>` : ''}
    ${slip.employees.employment_type ? `<div class="sub">${slip.employees.employment_type.replace(/-/g,' ')}</div>` : ''}
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="v">${totalDays}</div><div class="l">Days</div></div>
  <div class="stat"><div class="v">${totalHoursAll.toFixed(1)}h</div><div class="l">Hours</div></div>
  <div class="stat${lateDayCount > 0 ? ' red' : ''}"><div class="v">${lateDayCount}</div><div class="l">Late days</div></div>
  <div class="stat${totalLateMin > 0 ? ' red' : ''}"><div class="v">${totalLateMin}m</div><div class="l">Late total</div></div>
</div>

<div class="cols">
  <div class="col">
    <div class="sec">Earnings</div>
    <div class="row"><span>Basic Pay</span><span>${fmt(slip.basic_pay)}</span></div>
    ${showOT && slip.overtime_pay > 0 ? `<div class="row"><span>Overtime</span><span>${fmt(slip.overtime_pay)}</span></div>` : ''}
    ${showAllow && slip.allowance > 0 ? `<div class="row"><span>Allowance</span><span>${fmt(slip.allowance)}</span></div>` : ''}
    <div class="row tot"><span>Gross</span><span>${fmt(gross)}</span></div>
  </div>
  <div class="col">
    <div class="sec">Deductions</div>
    ${showLate && slip.late_deduction > 0 ? `<div class="row"><span>Late (${lateDayCount}d, ${totalLateMin}m)</span><span>–${fmt(slip.late_deduction)}</span></div>` : ''}
    ${showSSS && slip.sss_contribution > 0 ? `<div class="row"><span>SSS</span><span>–${fmt(slip.sss_contribution)}</span></div>` : ''}
    ${showPH && slip.philhealth_contribution > 0 ? `<div class="row"><span>PhilHealth</span><span>–${fmt(slip.philhealth_contribution)}</span></div>` : ''}
    ${showPagibig && slip.pagibig_contribution > 0 ? `<div class="row"><span>Pag-IBIG</span><span>–${fmt(slip.pagibig_contribution)}</span></div>` : ''}
    ${showTax && slip.tax_withheld > 0 ? `<div class="row"><span>Tax</span><span>–${fmt(slip.tax_withheld)}</span></div>` : ''}
    ${otherDeductions.map(o => `<div class="row"><span>${o.label}</span><span>–${fmt(o.amount)}</span></div>`).join('')}
    <div class="row tot"><span>Total Deductions</span><span>–${fmt(deductions)}</span></div>
  </div>
</div>

<div class="net"><span class="nl">Net Pay</span><span class="na">${fmt(slip.net_pay)}</span></div>

${Object.keys(shiftMap).length > 0 ? `
<div class="sec">Hours by Shift</div>
<table><thead><tr><th>Shift</th><th class="r">Days</th><th class="r">Hours</th><th class="r">Late</th></tr></thead>
<tbody>${shiftRows}</tbody></table>` : ''}

${sortedLogs.length > 0 ? `
<div class="sec">Daily Attendance</div>
<table><thead><tr><th>Date</th><th>Shift</th><th>In</th><th>Out</th><th class="r">Hrs</th><th class="r">Late</th></tr></thead>
<tbody>${attendanceRows}</tbody></table>` : ''}

${payslipNotes ? `<div class="notes">${payslipNotes}</div>` : ''}
<div class="foot">
  <span>${footerNote || 'System-generated payslip.'}</span>
  <span>${new Date().toLocaleString('en-US', { timeZone: shopTimezone })}</span>
</div>
</body></html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300) }
}

// ─── Export Payslips CSV ──────────────────────────────────────────────────────

function exportPayslipsCSV(payslips: Payslip[], period: PayrollPeriod) {
  const headers = [
    'Employee', 'Employee #', 'Role', 'Employment Type',
    'Basic Pay', 'Overtime Pay', 'Allowance', 'Gross Pay',
    'Late Deduction', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Tax', 'Total Deductions',
    'Net Pay', 'Status',
  ]
  const rows = payslips.map(slip => {
    const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
    const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld
    return [
      slip.employees.name,
      slip.employees.employee_no ?? '',
      slip.employees.role,
      slip.employees.employment_type ?? '',
      slip.basic_pay.toFixed(2),
      slip.overtime_pay.toFixed(2),
      slip.allowance.toFixed(2),
      gross.toFixed(2),
      slip.late_deduction.toFixed(2),
      slip.sss_contribution.toFixed(2),
      slip.philhealth_contribution.toFixed(2),
      slip.pagibig_contribution.toFixed(2),
      slip.tax_withheld.toFixed(2),
      deductions.toFixed(2),
      slip.net_pay.toFixed(2),
      slip.status,
    ]
  })
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payslips_${period.period_start}_to_${period.period_end}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Payslips exported as CSV')
}

// ─── Create Period Modal ──────────────────────────────────────────────────────

function CreatePeriodModal({ onClose, onCreate, templates }: {
  onClose: () => void
  onCreate: (data: { period_start: string; period_end: string; templateId?: string; employee_ids?: string[] }) => Promise<void>
  templates: PayslipTemplate[]
}) {
  const tz = 'Asia/Manila'
  const now = new Date()
  const tzParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => tzParts.find(p => p.type === t)?.value ?? '01'
  const y = get('year'), m = get('month'), d = parseInt(get('day'))
  const defaultStart = d <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`
  const lastDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(parseInt(y), parseInt(m), 0)
  )
  const defaultEnd = d <= 15 ? `${y}-${m}-15` : lastDay

  const [form, setForm] = useState({ period_start: defaultStart, period_end: defaultEnd })
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [empLoading, setEmpLoading] = useState(true)
  const [selectAll, setSelectAll] = useState(true)

  useEffect(() => {
    fetch('/api/employees')
      .then(r => safeJson(r))
      .then(data => {
        const emps: Employee[] = (data.employees ?? []).filter((e: any) => e.is_active !== false)
        setEmployees(emps)
        setSelectedIds(new Set(emps.map((e: Employee) => e.id)))
      })
      .catch(() => {})
      .finally(() => setEmpLoading(false))
  }, [])

  const toggleEmployee = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      setSelectAll(next.size === employees.length)
      return next
    })
  }

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)))
      setSelectAll(true)
    }
  }

  const handleSubmit = async () => {
    if (!form.period_start || !form.period_end) return
    if (selectedIds.size === 0) { toast.error('Select at least one employee'); return }
    setLoading(true)
    const employee_ids = selectedIds.size === employees.length ? undefined : [...selectedIds]
    await onCreate({ ...form, templateId: templateId || undefined, employee_ids })
    setLoading(false)
  }

  const selectedTpl = templates.find(t => t.id === templateId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Create Payroll Period</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period Start</label>
              <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period End</label>
              <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
            </div>
          </div>

          {/* Template selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payslip Layout</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
            >
              <option value="">Default Layout</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTpl && (
              <div className="mt-2 px-3 py-2 rounded-lg border text-xs text-gray-600 flex items-center gap-2" style={{ borderColor: selectedTpl.primaryColor + '40', backgroundColor: selectedTpl.primaryColor + '10' }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedTpl.primaryColor }} />
                {selectedTpl.companyName ? <span className="font-medium">{selectedTpl.companyName}</span> : null}
                {selectedTpl.footerNote ? <span className="text-gray-400 truncate">· {selectedTpl.footerNote}</span> : null}
              </div>
            )}
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">No templates yet — create one in the <span className="font-medium">Templates</span> tab.</p>
            )}
          </div>

          {/* Employee selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Employees to include</label>
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                {selectAll ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {empLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading employees…
              </div>
            ) : employees.length === 0 ? (
              <p className="text-xs text-gray-400">No active employees found.</p>
            ) : (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.role}{emp.employee_no ? ` · #${emp.employee_no}` : ''}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {selectedIds.size > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">{selectedIds.size} of {employees.length} employee{employees.length !== 1 ? 's' : ''} selected</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Draft payslips will be generated from time logs only for the selected employees in this date range.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || selectedIds.size === 0}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate {selectedIds.size > 0 ? `${selectedIds.size} Payslip${selectedIds.size !== 1 ? 's' : ''}` : 'Payslips'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Time Log Modal ───────────────────────────────────────────────────────

function AddTimeLogModal({
  date,
  employees,
  shifts,
  shopTimezone,
  onClose,
  onSave,
}: {
  date: string
  employees: Employee[]
  shifts: ShiftSchedule[]
  shopTimezone: string
  onClose: () => void
  onSave: (log: { employee_id: string; clock_in: string; clock_out: string; shift_schedule_id?: string; advances: { id: string; label: string; amount: number }[] }) => Promise<void>
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [clockIn, setClockIn] = useState('08:00')
  const [clockOut, setClockOut] = useState('17:00')
  const [saving, setSaving] = useState(false)
  const [advances, setAdvances] = useState<{ id: string; label: string; amount: number }[]>([])

  // When a shift is selected, pre-fill clock-in with shift start time
  const handleShiftChange = (id: string) => {
    setShiftId(id)
    const shift = shifts.find(s => s.id === id)
    if (shift) {
      setClockIn(shift.start_time.slice(0, 5))
      setClockOut(shift.end_time.slice(0, 5))
    }
  }

  // Compute late minutes based on selected shift
  const lateMinutes = (() => {
    const shift = shifts.find(s => s.id === shiftId)
    if (!shift || !clockIn) return 0
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [ch, cm] = clockIn.split(':').map(Number)
    const diff = (ch * 60 + cm) - (sh * 60 + sm)
    return diff > 0 ? diff : 0
  })()

  // Convert a "yyyy-MM-dd" + "HH:mm" pair in the shop's timezone to a UTC ISO string
  function toUtcIso(dateStr: string, timeStr: string, tz: string): string {
    const naiveMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const parts = formatter.formatToParts(new Date(naiveMs))
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    const localIso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
    const localMs = new Date(localIso + 'Z').getTime()
    return new Date(naiveMs - (localMs - naiveMs)).toISOString()
  }

  const handleSave = async () => {
    if (!employeeId) { toast.error('Please select an employee'); return }
    if (!shiftId) { toast.error('Please select a shift'); return }
    if (!clockIn) { toast.error('Please set a clock-in time'); return }

    const clockInISO  = toUtcIso(date, clockIn, shopTimezone)
    const clockOutISO = clockOut ? toUtcIso(date, clockOut, shopTimezone) : ''

    setSaving(true)
    await onSave({ employee_id: employeeId, clock_in: clockInISO, clock_out: clockOutISO, shift_schedule_id: shiftId || undefined, advances })
    setSaving(false)
  }

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Add Time Log</h2>
            <p className="text-xs text-gray-400 mt-0.5">{displayDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Employee selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Employee <span className="text-red-400">*</span></label>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
            >
              <option value="">— Select employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{emp.employee_no ? ` (#${emp.employee_no})` : ''} — {emp.role}
                </option>
              ))}
            </select>
          </div>

          {/* Shift selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift <span className="text-red-400">*</span></label>
            <select
              value={shiftId}
              onChange={e => handleShiftChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
            >
              <option value="">— Select shift —</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})
                </option>
              ))}
            </select>
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock In <span className="text-red-400">*</span></label>
              <input
                type="time"
                value={clockIn}
                onChange={e => setClockIn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock Out <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="time"
                value={clockOut}
                onChange={e => setClockOut(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Hours summary */}
          {clockIn && clockOut && clockOut > clockIn && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 text-xs text-indigo-700 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              {(() => {
                const [h1, m1] = clockIn.split(':').map(Number)
                const [h2, m2] = clockOut.split(':').map(Number)
                const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
                const hours = Math.floor(mins / 60)
                const rem = mins % 60
                return `${hours}h ${rem > 0 ? `${rem}m` : ''} total`
              })()}
            </div>
          )}

          {/* Late preview */}
          {shiftId && lateMinutes > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span><strong>{lateMinutes} minutes late</strong> based on selected shift start time</span>
            </div>
          )}
          {shiftId && lateMinutes === 0 && clockIn && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              On time — no late deduction
            </div>
          )}

          {/* Advance / extra deductions */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Advance / Deductions</p>
              <button
                type="button"
                onClick={() => setAdvances(a => [...a, { id: crypto.randomUUID(), label: 'Advance', amount: 0 }])}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {advances.length === 0 && (
              <p className="text-xs text-gray-400 italic">No deductions — click Add to record an advance or deduction for this day.</p>
            )}
            {advances.map(adv => (
              <div key={adv.id} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={adv.label}
                  onChange={e => setAdvances(a => a.map(x => x.id === adv.id ? { ...x, label: e.target.value } : x))}
                  placeholder="e.g. Advance salary"
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">₱</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={adv.amount || ''}
                    onChange={e => setAdvances(a => a.map(x => x.id === adv.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                    className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-right"
                  />
                </div>
                <button type="button" onClick={() => setAdvances(a => a.filter(x => x.id !== adv.id))}
                  className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {advances.length > 0 && (
              <div className="flex justify-between text-xs font-medium text-gray-700 pt-1 border-t border-gray-100">
                <span>Total deductions</span>
                <span className="text-red-600">–₱{advances.reduce((s, a) => s + a.amount, 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !employeeId || !shiftId || !clockIn}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Log
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Day Logs Modal ───────────────────────────────────────────────────────────

function DayLogsModal({
  date,
  logs,
  employees,
  shifts,
  shopTimezone,
  onClose,
  onAddLog,
  onRefresh,
  onEditLog,
}: {
  date: string
  logs: TimeLog[]
  employees: Employee[]
  shifts: ShiftSchedule[]
  shopTimezone: string
  onClose: () => void
  onAddLog: (log: { employee_id: string; clock_in: string; clock_out: string; shift_schedule_id?: string; advances: { id: string; label: string; amount: number }[] }) => Promise<void>
  onRefresh: () => void
  onEditLog: (log: TimeLog) => void
}) {
  const [showAddModal, setShowAddModal] = useState(false)

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const handleSave = async (log: { employee_id: string; clock_in: string; clock_out: string; shift_schedule_id?: string; advances: { id: string; label: string; amount: number }[] }) => {
    await onAddLog(log)
    setShowAddModal(false)
    onRefresh()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">{displayDate}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{logs.length} employee{logs.length !== 1 ? 's' : ''} clocked in</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Log
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium">No time logs for this date</p>
                <p className="text-xs mt-1 text-gray-400">Click "Add Log" to create one manually</p>
              </div>
            ) : logs.map(log => {
              const hours = log.total_hours ? Number(log.total_hours).toFixed(2) : '—'
              const late = log.late_minutes ? `${log.late_minutes} min late` : null
              const ot = log.overtime_hours && Number(log.overtime_hours) > 0 ? `${Number(log.overtime_hours).toFixed(2)}h OT` : null
              return (
                <div key={log.id}
                  onClick={() => onEditLog(log)}
                  className="border border-gray-100 rounded-xl p-4 bg-gray-50 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/40 transition-all group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{log.employees?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{log.employees?.role ?? ''}{log.employees?.employee_no ? ` · #${log.employees.employee_no}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.clock_out ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.clock_out ? 'Completed' : 'Still clocked in'}
                      </span>
                      <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        <Pencil className="w-3 h-3" /> Edit
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-gray-400">Clock In</p>
                      <p className="text-sm font-medium text-gray-700">{fmtTime(log.clock_in, shopTimezone)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Clock Out</p>
                      <p className="text-sm font-medium text-gray-700">{log.clock_out ? fmtTime(log.clock_out, shopTimezone) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Total Hours</p>
                      <p className="text-sm font-medium text-gray-700">{hours}h</p>
                    </div>
                  </div>
                  {(late || ot) && (
                    <div className="flex gap-2 mt-2">
                      {late && <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{late}</span>}
                      {ot && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{ot}</span>}
                    </div>
                  )}
                  {Array.isArray(log.advances) && (log.advances?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {log.advances!.map((a) => (
                        <span key={a.id} className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full">
                          {a.label}: –₱{Number(a.amount).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add another time log
            </button>
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddTimeLogModal
          date={date}
          employees={employees}
          shifts={shifts}
          shopTimezone={shopTimezone}
          onClose={() => setShowAddModal(false)}
          onSave={handleSave}
        />
      )}

    </>
  )
}

// ─── Edit Time Log Modal ──────────────────────────────────────────────────────

function EditTimeLogModal({
  log,
  shifts,
  shopTimezone,
  onClose,
  onSave,
  onDelete,
}: {
  log: TimeLog
  shifts: ShiftSchedule[]
  shopTimezone: string
  onClose: () => void
  onSave: (updates: { clock_in: string; clock_out: string | null; late_minutes: number; is_late: boolean; shift_schedule_id?: string; notes?: string; advances: { id: string; label: string; amount: number }[] }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const toLocalTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: shopTimezone, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso))
    } catch { return '00:00' }
  }

  const dateStr = log.clock_in.split('T')[0]
  const existingShiftId = log.shift_schedule_id ?? ''
  const [shiftId, setShiftId] = useState<string>(existingShiftId)
  const [clockIn, setClockIn] = useState(toLocalTime(log.clock_in))
  const [clockOut, setClockOut] = useState(log.clock_out ? toLocalTime(log.clock_out) : '')
  const [notes, setNotes] = useState(log.notes ?? '')
  const [advances, setAdvances] = useState<{ id: string; label: string; amount: number }[]>(
    Array.isArray(log.advances) ? log.advances : []
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Compute late minutes live based on selected shift + clock-in time
  const { lateMinutes, isLate } = (() => {
    const shift = shifts.find(s => s.id === shiftId)
    if (!shift || !clockIn) return { lateMinutes: 0, isLate: false }
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [ch, cm] = clockIn.split(':').map(Number)
    const diff = (ch * 60 + cm) - (sh * 60 + sm)
    return { lateMinutes: diff > 0 ? diff : 0, isLate: diff > 0 }
  })()

  function toUtcIso(dateS: string, timeS: string, tz: string): string {
    const naiveMs = new Date(`${dateS}T${timeS}:00Z`).getTime()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const parts = formatter.formatToParts(new Date(naiveMs))
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    const localIso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
    const localMs = new Date(localIso + 'Z').getTime()
    return new Date(naiveMs - (localMs - naiveMs)).toISOString()
  }

  const handleSave = async () => {
    if (!clockIn) { toast.error('Clock-in time is required'); return }
    setSaving(true)
    await onSave({
      clock_in: toUtcIso(dateStr, clockIn, shopTimezone),
      clock_out: clockOut ? toUtcIso(dateStr, clockOut, shopTimezone) : null,
      late_minutes: lateMinutes,
      is_late: isLate,
      shift_schedule_id: shiftId || undefined,
      notes,
      advances,
    })
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(log.id)
    setDeleting(false)
  }

  const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Time Log</h2>
            <p className="text-xs text-gray-400 mt-0.5">{log.employees?.name} · {displayDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Shift selector — used to compute late minutes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift <span className="text-gray-400 font-normal">(for late calculation)</span></label>
            <select value={shiftId} onChange={e => setShiftId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
              <option value="">— No shift selected —</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0,5)} – {s.end_time.slice(0,5)})</option>
              ))}
            </select>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock In <span className="text-red-400">*</span></label>
              <input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock Out</label>
              <input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          {/* Hours & late summary */}
          <div className="flex gap-2">
            {clockIn && clockOut && clockOut > clockIn && (
              <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                {(() => {
                  const [h1, m1] = clockIn.split(':').map(Number)
                  const [h2, m2] = clockOut.split(':').map(Number)
                  const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
                  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`
                })()}
              </div>
            )}
            {shiftId && isLate && (
              <div className="flex-1 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <strong>{lateMinutes} min late</strong>
              </div>
            )}
            {shiftId && !isLate && clockIn && (
              <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> On time
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Covering for absent staff"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {/* Advances / deductions — scoped to THIS employee on THIS day */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Advances / Deductions</p>
                <p className="text-[10px] text-gray-400 mt-0.5">For {log.employees?.name ?? 'this employee'} on this day only</p>
              </div>
              <button type="button"
                onClick={() => setAdvances(a => [...a, { id: crypto.randomUUID(), label: 'Advance', amount: 0 }])}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {advances.length === 0 && (
              <p className="text-xs text-gray-400 italic">No deductions for this employee today.</p>
            )}
            {advances.map(adv => (
              <div key={adv.id} className="flex items-center gap-2 mb-2">
                <input type="text" value={adv.label}
                  onChange={e => setAdvances(a => a.map(x => x.id === adv.id ? { ...x, label: e.target.value } : x))}
                  placeholder="e.g. Advance salary"
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">₱</span>
                  <input type="number" step="0.01" min="0" value={adv.amount || ''}
                    onChange={e => setAdvances(a => a.map(x => x.id === adv.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                    className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-right" />
                </div>
                <button type="button" onClick={() => setAdvances(a => a.filter(x => x.id !== adv.id))}
                  className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {advances.length > 0 && (
              <div className="flex justify-between text-xs font-medium text-gray-700 pt-1 border-t border-gray-100">
                <span>Total deductions</span>
                <span className="text-red-600">–₱{advances.reduce((s, a) => s + a.amount, 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Delete zone */}
          <div className="border-t border-red-100 pt-3">
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete this time log
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                <p className="text-xs text-red-700 font-medium">Delete this log permanently?</p>
                <div className="flex gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50">Cancel</button>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !clockIn}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Attendance Calendar Tab ──────────────────────────────────────────────────

function AttendanceTab() {
  const today = new Date()
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [logsByDate, setLogsByDate] = useState<Record<string, TimeLog[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingTimeLog, setEditingTimeLog] = useState<TimeLog | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<ShiftSchedule[]>([])

  // Fetch shop timezone once
  useEffect(() => {
    fetch('/api/shop')
      .then(r => r.json())
      .then(data => { if (data?.shop?.timezone) setShopTimezone(data.shop.timezone) })
      .catch(() => {})
  }, [])

  // Fetch employees once for the Add Log modal
  useEffect(() => {
    fetch('/api/employees')
      .then(r => safeJson(r))
      .then(data => {
        if (data.employees) setEmployees(data.employees)
      })
      .catch(() => {})
  }, [])

  // Fetch shifts once for the shift selector
  useEffect(() => {
    fetch('/api/shifts')
      .then(r => safeJson(r))
      .then(data => {
        if (Array.isArray(data.shifts)) setShifts(data.shifts)
        else if (Array.isArray(data)) setShifts(data)
      })
      .catch(() => {})
  }, [])

  const fetchMonthLogs = useCallback(async () => {
    setLoading(true)
    const date_from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const date_to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    try {
      const res = await fetch(`/api/time-logs?date_from=${date_from}&date_to=${date_to}`)
      const data = await safeJson(res)

      if (data.error) {
        console.warn('time-logs API error:', data.error)
        setLogsByDate({})
        return
      }

      const byDate: Record<string, TimeLog[]> = {}
      for (const log of data.logs ?? []) {
        // Use the log.date field if present, otherwise parse from clock_in
        const d = log.date ?? log.clock_in?.split('T')[0]
        if (!d) continue
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(log)
      }
      setLogsByDate(byDate)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchMonthLogs() }, [fetchMonthLogs])

  const handleTimeLogEdit = async (id: string, updates: { clock_in: string; clock_out: string | null; late_minutes: number; is_late: boolean; shift_schedule_id?: string; notes?: string; advances: { id: string; label: string; amount: number }[] }) => {
    try {
      const res = await fetch('/api/time-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Time log updated')
      setEditingTimeLog(null)
      await fetchMonthLogs()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update log')
    }
  }

  const handleTimeLogDelete = async (id: string) => {
    try {
      const res = await fetch('/api/time-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Time log deleted')
      setEditingTimeLog(null)
      await fetchMonthLogs()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete log')
    }
  }

  const handleAddLog = async (log: { employee_id: string; clock_in: string; clock_out: string; shift_schedule_id?: string; advances?: { id: string; label: string; amount: number }[] }) => {
    try {
      const body: Record<string, any> = {
        action: 'manual',
        employee_id: log.employee_id,
        clock_in: log.clock_in,
      }
      if (log.clock_out) {
        body.clock_out = log.clock_out
      }
      if (log.shift_schedule_id) {
        body.shift_schedule_id = log.shift_schedule_id
      }
      if (log.advances && log.advances.length > 0) {
        body.advances = log.advances
      }

      const res = await fetch('/api/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      toast.success('Time log saved')
      await fetchMonthLogs()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save time log')
      throw e
    }
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: shopTimezone }).format(today)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="p-6 max-w-4xl">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{MONTH_FULL[month]} {year}</h2>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
          <button onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()) }}
            className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">Today</button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const logs = logsByDate[dateStr] || []
          const hasLogs = logs.length > 0
          const isToday = dateStr === todayStr
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(dateStr)}
              className={`relative min-h-[68px] p-2 rounded-xl border text-left transition-all group
                ${isToday ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 bg-white'}
                ${hasLogs ? 'hover:border-indigo-300 hover:bg-indigo-50/50' : 'hover:border-gray-200 hover:bg-gray-50'}
                cursor-pointer
              `}
            >
              <span className={`text-xs font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>{day}</span>
              {hasLogs && (
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                    <Users className="w-2.5 h-2.5" />{logs.length}
                  </span>
                </div>
              )}
              {/* + hover hint for empty days */}
              {!hasLogs && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-100 border border-indigo-400 inline-block" /> Today</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-[10px]"><Users className="w-2.5 h-2.5" />N</span>
          Employees clocked in
        </span>
        <span className="flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-gray-300" />
          Click any date to view or add logs
        </span>
      </div>

      {selectedDate && (
        <DayLogsModal
          date={selectedDate}
          logs={logsByDate[selectedDate] || []}
          employees={employees}
          shifts={shifts}
          shopTimezone={shopTimezone}
          onClose={() => setSelectedDate(null)}
          onAddLog={handleAddLog}
          onRefresh={fetchMonthLogs}
          onEditLog={log => setEditingTimeLog(log)}
        />
      )}

      {editingTimeLog && (
        <EditTimeLogModal
          log={editingTimeLog}
          shifts={shifts}
          shopTimezone={shopTimezone}
          onClose={() => setEditingTimeLog(null)}
          onSave={(updates) => handleTimeLogEdit(editingTimeLog.id, updates)}
          onDelete={handleTimeLogDelete}
        />
      )}
    </div>
  )
}

// ─── Template Form Modal ──────────────────────────────────────────────────────

function TemplateFormModal({ initial, onClose, onSave }: {
  initial?: PayslipTemplate
  onClose: () => void
  onSave: (tpl: PayslipTemplate) => void
}) {
  const [form, setForm] = useState<Omit<PayslipTemplate, 'id' | 'createdAt'>>({
    name: initial?.name ?? '',
    companyName: initial?.companyName ?? '',
    companyAddress: initial?.companyAddress ?? '',
    primaryColor: initial?.primaryColor ?? '#4f46e5',
    showEmployeeNo: initial?.showEmployeeNo ?? true,
    showOvertimePay: initial?.showOvertimePay ?? true,
    showAllowance: initial?.showAllowance ?? true,
    showLateDeduction: initial?.showLateDeduction ?? true,
    showSSS: initial?.showSSS ?? true,
    showPhilHealth: initial?.showPhilHealth ?? true,
    showPagibig: initial?.showPagibig ?? true,
    showTax: initial?.showTax ?? true,
    footerNote: initial?.footerNote ?? '',
    logoUrl: initial?.logoUrl ?? '/Capture.jpg',
  })

  const Toggle = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <button
      onClick={() => setForm(f => ({ ...f, [field]: !f[field] }))}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg border text-sm transition-colors ${form[field] ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
    >
      <span>{label}</span>
      {form[field]
        ? <Eye className="w-3.5 h-3.5 text-indigo-500" />
        : <EyeOff className="w-3.5 h-3.5" />}
    </button>
  )

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Template name is required'); return }
    onSave({
      ...form,
      id: initial?.id ?? crypto.randomUUID(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Template' : 'New Payslip Template'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template Name <span className="text-red-400">*</span></label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Payslip, Executive Format…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
          </div>

          {/* Company info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Company Info</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input
                value={form.companyName}
                onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                placeholder="Shown on printed payslips"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Address</label>
              <input
                value={form.companyAddress}
                onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))}
                placeholder="Optional address line"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
              <div className="flex items-center gap-3">
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded border border-gray-200 bg-gray-50 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <input
                  value={form.logoUrl}
                  onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="/Capture.jpg"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Path to image in your /public folder, e.g. /Capture.jpg</p>
            </div>
          </div>

          {/* Color */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Accent Color</p>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setForm(f => ({ ...f, primaryColor: c.value }))}
                  title={c.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.primaryColor === c.value ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                  title="Custom color"
                />
                <span className="text-xs text-gray-400">Custom</span>
              </div>
            </div>
          </div>

          {/* Earnings fields */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Show Earnings Fields</p>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Employee No." field="showEmployeeNo" />
              <Toggle label="Overtime Pay" field="showOvertimePay" />
              <Toggle label="Allowance" field="showAllowance" />
            </div>
          </div>

          {/* Deduction fields */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Show Deduction Fields</p>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Late Deduction" field="showLateDeduction" />
              <Toggle label="SSS" field="showSSS" />
              <Toggle label="PhilHealth" field="showPhilHealth" />
              <Toggle label="Pag-IBIG" field="showPagibig" />
              <Toggle label="Withholding Tax" field="showTax" />
            </div>
          </div>

          {/* Footer note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Footer Note</label>
            <input
              value={form.footerNote}
              onChange={e => setForm(f => ({ ...f, footerNote: e.target.value }))}
              placeholder="e.g. This is a system-generated payslip."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
            <Save className="w-3.5 h-3.5" /> {initial ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<PayslipTemplate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PayslipTemplate | undefined>()

  useEffect(() => { setTemplates(loadTemplates()) }, [])

  const handleSave = (tpl: PayslipTemplate) => {
    const next = editing
      ? templates.map(t => t.id === tpl.id ? tpl : t)
      : [...templates, tpl]
    setTemplates(next)
    saveTemplates(next)
    setShowForm(false)
    setEditing(undefined)
    toast.success(editing ? 'Template updated' : 'Template created')
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this template? Existing payslips using it won\'t be affected.')) return
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    saveTemplates(next)
    toast.success('Template deleted')
  }

  const openEdit = (tpl: PayslipTemplate) => { setEditing(tpl); setShowForm(true) }
  const openNew = () => { setEditing(undefined); setShowForm(true) }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payslip Templates</h2>
          <p className="text-sm text-gray-400 mt-0.5">Create named layouts to reuse when generating payroll periods.</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl py-16 flex flex-col items-center justify-center text-center">
          <LayoutTemplate className="w-10 h-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No templates yet</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">Create a template to define your payslip layout — company name, colors, and which fields to show.</p>
          <button onClick={openNew}
            className="mt-5 flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => {
            const visibleEarnings = [tpl.showOvertimePay && 'Overtime', tpl.showAllowance && 'Allowance'].filter(Boolean)
            const hiddenDeductions = [!tpl.showLateDeduction && 'Late', !tpl.showSSS && 'SSS', !tpl.showPhilHealth && 'PhilHealth', !tpl.showPagibig && 'Pag-IBIG', !tpl.showTax && 'Tax'].filter(Boolean)
            return (
              <div key={tpl.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                {/* Color bar */}
                <div className="h-1.5" style={{ backgroundColor: tpl.primaryColor }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{tpl.name}</p>
                      {tpl.companyName && <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1"><Building2 className="w-3 h-3" />{tpl.companyName}</p>}
                    </div>
                    <span className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: tpl.primaryColor }} />
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {visibleEarnings.length > 0 && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Eye className="w-3 h-3 text-indigo-400" />
                        Shows: {visibleEarnings.join(', ')}
                      </div>
                    )}
                    {hiddenDeductions.length > 0 && (
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <EyeOff className="w-3 h-3" />
                        Hides: {hiddenDeductions.join(', ')}
                      </div>
                    )}
                    {tpl.footerNote && (
                      <div className="text-xs text-gray-400 italic truncate">"{tpl.footerNote}"</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button onClick={() => openEdit(tpl)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => handleDelete(tpl.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <TemplateFormModal
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(undefined) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const PAYROLL_SETTINGS_KEY = 'payroll_settings'

function loadPayrollSettings(): PayrollSettings {
  try {
    const raw = localStorage.getItem(PAYROLL_SETTINGS_KEY)
    if (!raw) return { late_deduction_per_minute: 0, late_deduction_type: 'per_minute', late_deduction_flat_amount: 100, sss_rate: 0, philhealth_rate: 0, pagibig_flat: 0, overtime_multiplier: 1, tax_rate: 0, break_mode: 'auto', break_duration_minutes: 60 }
    return { late_deduction_per_minute: 0, late_deduction_type: 'per_minute', late_deduction_flat_amount: 100, sss_rate: 0, philhealth_rate: 0, pagibig_flat: 0, overtime_multiplier: 1, tax_rate: 0, break_mode: 'auto', break_duration_minutes: 60, ...JSON.parse(raw) }
  } catch { return { late_deduction_per_minute: 0, late_deduction_type: 'per_minute', late_deduction_flat_amount: 100, sss_rate: 0, philhealth_rate: 0, pagibig_flat: 0, overtime_multiplier: 1, tax_rate: 0, break_mode: 'auto', break_duration_minutes: 60 } }
}

function savePayrollSettings(s: PayrollSettings) {
  try { localStorage.setItem(PAYROLL_SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

// ─── Settings Field ───────────────────────────────────────────────────────────
// Defined outside SettingsTab so React doesn't remount it on every keystroke.
function SettingsField({
  label, field, unit, description, settings, setSettings,
}: {
  label: string
  field: keyof PayrollSettings
  unit: string
  description?: string
  settings: PayrollSettings
  setSettings: React.Dispatch<React.SetStateAction<PayrollSettings>>
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" step="0.01" min="0"
          value={(settings[field] as number) ?? 0}
          onChange={e => setSettings(s => ({ ...s, [field]: parseFloat(e.target.value) || 0 }))}
          className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
        />
        <span className="text-xs text-gray-400 w-12">{unit}</span>
      </div>
    </div>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState<PayrollSettings>({
    late_deduction_per_minute: 0, late_deduction_type: 'per_minute', late_deduction_flat_amount: 100, sss_rate: 0, philhealth_rate: 0,
    pagibig_flat: 0, overtime_multiplier: 1, tax_rate: 0, payslip_notes: '',
    break_mode: 'auto', break_duration_minutes: 60, kiosk_mode: 'show_all',
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')


  // Load settings from API on mount
  useEffect(() => {
    fetch('/api/payroll/settings')
      .then(r => safeJson(r))
      .then(data => {
        if (data?.settings && !data.error) {
          const rest = data.settings
          // Merge with localStorage fallback so fields missing from the API
          // response (e.g. late_deduction_type if the column was added later)
          // are still populated from the last locally-saved value.
          const localFallback = loadPayrollSettings()
          setSettings(prev => ({ ...prev, ...localFallback, ...rest }))
          if (data.shop_timezone) setShopTimezone(data.shop_timezone)
        } else {
          // Fall back to localStorage
          setSettings(loadPayrollSettings())
        }
      })
      .catch(() => {
        setSettings(loadPayrollSettings())
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const payload = { ...settings }
    try {
      const res = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      // Keep localStorage in sync as fallback
      savePayrollSettings(settings)
      toast.success('Payroll settings saved')
    } catch (e: any) {
      // Fallback: save to localStorage only
      savePayrollSettings(settings)
      toast.success('Settings saved locally')
    } finally {
      setSaving(false)
    }
  }


  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-40 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading settings…
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payroll Settings</h2>
          <p className="text-sm text-gray-400 mt-0.5">Default rates used when generating payslips.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-2">Deductions</p>
        {/* Late Deduction — toggle flat vs per-minute */}
        <div className="py-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Late Deduction</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {settings.late_deduction_type === 'flat'
                  ? `₱${settings.late_deduction_flat_amount ?? 100} deducted per late day (multiplied by number of late occurrences)`
                  : 'Amount deducted per minute of tardiness'}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-4 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSettings(s => ({ ...s, late_deduction_type: 'per_minute' }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.late_deduction_type !== 'flat'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Per Min
              </button>
              <button
                onClick={() => setSettings(s => ({ ...s, late_deduction_type: 'flat' }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.late_deduction_type === 'flat'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Flat / Day
              </button>
            </div>
          </div>
          {/* Amount input — changes label based on mode */}
          <div className="flex items-center justify-end gap-2 mt-3">
            {settings.late_deduction_type === 'flat' ? (
              <>
                <span className="text-xs text-gray-400">₱ per late day</span>
                <input
                  type="number" step="1" min="0"
                  value={settings.late_deduction_flat_amount ?? 100}
                  onChange={e => setSettings(s => ({ ...s, late_deduction_flat_amount: parseFloat(e.target.value) || 0 }))}
                  className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
                />
              </>
            ) : (
              <>
                <span className="text-xs text-gray-400">₱ / min</span>
                <input
                  type="number" step="0.01" min="0"
                  value={settings.late_deduction_per_minute ?? 0}
                  onChange={e => setSettings(s => ({ ...s, late_deduction_per_minute: parseFloat(e.target.value) || 0 }))}
                  className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
                />
              </>
            )}
          </div>
        </div>
        <SettingsField label="SSS Contribution" field="sss_rate" unit="% of basic" description="Employee share, semi-monthly"  settings={settings} setSettings={setSettings} />
        <SettingsField label="PhilHealth Contribution" field="philhealth_rate" unit="% of basic" description="Employee share, semi-monthly"  settings={settings} setSettings={setSettings} />
        <SettingsField label="Pag-IBIG Contribution" field="pagibig_flat" unit="₱ / month" description="Flat monthly amount (split semi-monthly)" settings={settings} setSettings={setSettings} />
        <SettingsField label="Withholding Tax" field="tax_rate" unit="% of gross" description="Set to 0 to skip; override per payslip if needed"  settings={settings} setSettings={setSettings} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-2">Earnings</p>
        <SettingsField label="Overtime Multiplier" field="overtime_multiplier" unit="× rate" description="e.g. 1.25 = 125% of hourly rate for OT hours"  settings={settings} setSettings={setSettings} />
      </div>

      {/* ── Break Settings ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-2">Break Time</p>

        {/* Toggle: auto vs manual */}
        <div className="flex items-center justify-between py-4 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Break Mode</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {settings.break_mode === 'manual'
                ? 'Employees clock break in/out at the kiosk — actual duration is deducted'
                : 'A flat duration is automatically deducted from every shift at clock-out'}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-4 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSettings(s => ({ ...s, break_mode: 'auto' }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                settings.break_mode !== 'manual'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setSettings(s => ({ ...s, break_mode: 'manual' }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                settings.break_mode === 'manual'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        {/* Duration input — only shown in auto mode */}
        {settings.break_mode !== 'manual' && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Break Duration</p>
              <p className="text-xs text-gray-400 mt-0.5">Minutes automatically deducted from total hours at clock-out</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" step="1" min="0"
                value={settings.break_duration_minutes ?? 60}
                onChange={e => setSettings(s => ({ ...s, break_duration_minutes: parseInt(e.target.value) || 0 }))}
                className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
              />
              <span className="text-xs text-gray-400 w-12">minutes</span>
            </div>
          </div>
        )}

        {settings.break_mode === 'manual' && (
          <p className="text-xs text-gray-400 py-4">
            The kiosk will show <span className="font-medium text-gray-600">Take a Break</span> and <span className="font-medium text-gray-600">Back to Work</span> buttons. Total break time is computed from those logs and deducted at clock-out.
          </p>
        )}
      </div>

      {/* ── Kiosk Mode ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-2">Kiosk Mode</p>

        <div className="flex items-center justify-between py-4 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Employee Selection</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {settings.kiosk_mode === 'pin_first'
                ? 'Employees enter their PIN first — their card appears after verification'
                : 'All employee cards are shown upfront — employee taps their card then enters PIN'}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-4 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSettings(s => ({ ...s, kiosk_mode: 'show_all' }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                settings.kiosk_mode !== 'pin_first'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Show All
            </button>
            <button
              onClick={() => setSettings(s => ({ ...s, kiosk_mode: 'pin_first' }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                settings.kiosk_mode === 'pin_first'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              PIN First
            </button>
          </div>
        </div>

        {settings.kiosk_mode === 'pin_first' && (
          <p className="text-xs text-gray-400 py-4">
            The kiosk will show a blank PIN pad. After a valid PIN is entered, the employee's card appears with their current status and available actions.
          </p>
        )}
        {settings.kiosk_mode !== 'pin_first' && (
          <p className="text-xs text-gray-400 py-4">
            All employee cards are visible on the kiosk. Employees tap their card, then confirm with their PIN.
          </p>
        )}
      </div>

      {/* ── Payslip Notes ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <div className="pt-4 pb-4">
          <div className="mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Payslip Notes</p>
            <p className="text-xs text-gray-400 mt-0.5">Appears as a note box at the bottom of every printed payslip</p>
          </div>
          <textarea
            value={settings.payslip_notes ?? ''}
            onChange={e => setSettings(s => ({ ...s, payslip_notes: e.target.value }))}
            placeholder="e.g. This is a system-generated payslip. For concerns, contact HR."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">These are defaults only. You can still override individual payslip amounts after generating.</p>
    </div>
  )
}

// ─── EditField ────────────────────────────────────────────────────────────────
// Defined OUTSIDE QuickPayslipGenerator so it has a stable identity across
// re-renders — prevents the "one character at a time" focus-loss bug.
function EditField({ label, value, onChange, negative, isFinalized }: {
  label: string; value: number; onChange: (v: number) => void; negative?: boolean; isFinalized: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-1">
        {negative && <span className="text-xs text-red-400">−</span>}
        <span className="text-xs text-gray-400">₱</span>
        {isFinalized
          ? <span className="w-32 px-2 py-1 text-sm text-right text-gray-800">{fmt(value)}</span>
          : <input type="number" step="0.01" min="0" value={value || 0}
              onChange={e => onChange(parseFloat(e.target.value) || 0)}
              className="w-32 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        }
      </div>
    </div>
  )
}

// ─── Quick Payslip Generator ──────────────────────────────────────────────────

type AttendanceLog = {
  date: string
  shift_name?: string
  clock_in: string
  clock_out: string | null
  total_hours: number | null
  late_minutes: number | null
  overtime_hours: number | null
  advances?: { id: string; label: string; amount: number }[]
}

function QuickPayslipGenerator() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empLoading, setEmpLoading] = useState(true)
  const [templates, setTemplates] = useState<PayslipTemplate[]>([])
  const [settings, setSettings] = useState<PayrollSettings | null>(null)
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')

  // Period
  const tz = 'Asia/Manila'
  const now = new Date()
  const tzParts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const getP = (t: string) => tzParts.find(p => p.type === t)?.value ?? '01'
  const y = getP('year'), mo = getP('month'), dy = parseInt(getP('day'))
  const defaultStart = dy <= 15 ? `${y}-${mo}-01` : `${y}-${mo}-16`
  const lastDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(parseInt(y), parseInt(mo), 0))
  const defaultEnd = dy <= 15 ? `${y}-${mo}-15` : lastDay

  const [employeeId, setEmployeeId] = useState('')
  const [periodStart, setPeriodStart] = useState(defaultStart)
  const [periodEnd, setPeriodEnd] = useState(defaultEnd)
  const [format, setFormat] = useState<'payslip1' | 'payslip2'>('payslip1')
  const [templateId, setTemplateId] = useState('')

  // Fetched attendance
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')

  // Saved payslip state (after Save Draft / Finalize)
  const [savedPeriodId, setSavedPeriodId] = useState<string | null>(null)
  const [savedPayslipId, setSavedPayslipId] = useState<string | null>(null)
  const [payslipStatus, setPayslipStatus] = useState<'draft' | 'released' | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // Computed pay values (editable overrides)
  const [basicPay, setBasicPay] = useState(0)
  const [liveComputed, setLiveComputed] = useState<{
    basicPay: number; overtimePay: number; lateDeduction: number
    sss: number; philhealth: number; pagibig: number; tax: number
  } | null>(null)
  const [overtimePay, setOvertimePay] = useState(0)
  const [allowance, setAllowance] = useState(0)
  const [lateDeduction, setLateDeduction] = useState(0)
  const [sss, setSss] = useState(0)
  const [philhealth, setPhilhealth] = useState(0)
  const [pagibig, setPagibig] = useState(0)
  const [tax, setTax] = useState(0)
  const [otherDeductions, setOtherDeductions] = useState<{ id: string; label: string; amount: number }[]>([])

  // Load employees + settings once
  useEffect(() => {
    fetch('/api/employees').then(r => safeJson(r)).then(d => {
      setEmployees((d.employees ?? []).filter((e: any) => e.is_active !== false))
    }).catch(() => {}).finally(() => setEmpLoading(false))
    setTemplates(loadTemplates())
    fetch('/api/payroll/settings').then(r => safeJson(r)).then(d => {
      if (d?.settings && !d.error) {
        // Merge with localStorage so fields missing from the API (e.g. late_deduction_type)
        // still resolve to the last locally-saved value rather than undefined.
        const localFallback = loadPayrollSettings()
        setSettings({ ...localFallback, ...d.settings })
      } else {
        setSettings(loadPayrollSettings())
      }
      if (d?.shop_timezone) setShopTimezone(d.shop_timezone)
    }).catch(() => setSettings(loadPayrollSettings()))
  }, [])

  // Fetch time logs whenever employee or period changes
  useEffect(() => {
    if (!employeeId || !periodStart || !periodEnd || !settings) {
      setLogs([])
      setBasicPay(0); setOvertimePay(0); setLateDeduction(0)
      return
    }
    setLogsLoading(true)
    setLogsError('')
    fetch(`/api/time-logs?employee_id=${employeeId}&date_from=${periodStart}&date_to=${periodEnd}`)
      .then(r => safeJson(r))
      .then(d => {
        if (d.error) { setLogsError(d.error); setLogs([]); return }
        const raw = d.logs ?? []

        const s = settings ?? loadPayrollSettings()
        const breakDeductionHours =
          s.break_mode !== 'manual' ? (s.break_duration_minutes ?? 0) / 60 : 0

        // Helper: convert ISO timestamp to minutes since midnight in shop timezone
        function isoToMinutes(iso: string, tz: string): number {
          const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
          }).formatToParts(new Date(iso))
          const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
          const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
          return h * 60 + m
        }

        // Helper: "HH:mm" or "HH:mm:ss" → minutes since midnight
        function timeStrToMinutes(t: string): number {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m
        }

        const parsed: AttendanceLog[] = raw.map((l: any) => {
          // Compute billable hours using the shift window:
          //   pay starts at max(actual_clock_in, shift_start)
          //   pay ends   at min(actual_clock_out, shift_end)
          //   early clock-in = no bonus, late clock-out = no overtime
          let netHours: number | null = null

          const shiftStart: string | undefined = l.shift_schedules?.start_time
          const shiftEnd: string | undefined   = l.shift_schedules?.end_time
          const isOvernight: boolean           = l.shift_schedules?.is_overnight ?? false

          if (l.clock_in && l.clock_out && shiftStart && shiftEnd) {
            const shiftStartMin  = timeStrToMinutes(shiftStart)
            const shiftEndMin    = timeStrToMinutes(shiftEnd)
            const effectiveEnd   = isOvernight ? shiftEndMin + 1440 : shiftEndMin

            let actualStart = isoToMinutes(l.clock_in, shopTimezone)
            let actualEnd   = isoToMinutes(l.clock_out, shopTimezone)

            // Overnight: if clock_out reads past midnight as a small number, add 24h
            if (isOvernight && actualEnd < shiftStartMin) actualEnd += 1440

            // When late deduction is a flat fee, the employee is already being
            // penalized via the flat fee — don't also shrink their paid hours
            // for the minutes they were late. Pay as if they clocked in on time.
            // (Early clock-in still gives no bonus either way.)
            const payStart = s.late_deduction_type === 'flat'
              ? shiftStartMin
              : Math.max(actualStart, shiftStartMin)

            const payEnd         = Math.min(actualEnd, effectiveEnd)
            const billableMins   = Math.max(0, payEnd - payStart)
            netHours = Math.max(0, (billableMins / 60) - breakDeductionHours)
          } else if (l.total_hours != null && l.clock_out) {
            // No shift info — fall back to stored hours minus break
            netHours = Math.max(0, Number(l.total_hours) - breakDeductionHours)
          } else if (l.total_hours != null) {
            netHours = Number(l.total_hours)
          }

          return {
            date: l.date ?? l.clock_in?.split('T')[0],
            shift_name: l.shift_schedules?.name ?? l.shift_name ?? null,
            clock_in: l.clock_in,
            clock_out: l.clock_out ?? null,
            total_hours: netHours,
            late_minutes: l.late_minutes != null ? Number(l.late_minutes) : null,
            overtime_hours: 0,
            advances: Array.isArray(l.advances) ? l.advances : [],
          }
        }).sort((a: AttendanceLog, b: AttendanceLog) => a.date.localeCompare(b.date))
        setLogs(parsed)

        // ── Auto-compute pay from logs + settings ──
        const emp = employees.find(e => e.id === employeeId)
        const rate = emp?.hourly_rate ?? 0

        // total_hours per log is already shift-window capped and break-deducted above
        const totalRegularHours = parsed.reduce((sum, l) => sum + (l.total_hours ?? 0), 0)
        const totalOTHours = 0
        const totalLateMin = parsed.reduce((sum, l) => sum + (l.late_minutes ?? 0), 0)

        const computedBasic = Math.round(totalRegularHours * rate * 100) / 100
        const computedOT = 0

        // Late deduction
        let computedLate = 0
        if (s.late_deduction_type === 'flat') {
          const lateDays = parsed.filter(l => (l.late_minutes ?? 0) > 0).length
          computedLate = lateDays * (s.late_deduction_flat_amount ?? 0)
        } else {
          computedLate = Math.round(totalLateMin * (s.late_deduction_per_minute ?? 0) * 100) / 100
        }

        const computedAllowance = emp?.allowance ?? 0
        const grossForDeductions = computedBasic + computedOT + computedAllowance
        const computedSSS = Math.round(grossForDeductions * ((s.sss_rate ?? 0) / 100) * 100) / 100
        const computedPH = Math.round(grossForDeductions * ((s.philhealth_rate ?? 0) / 100) * 100) / 100
        const computedPagibig = s.pagibig_flat ?? 0
        const computedTax = Math.round(grossForDeductions * ((s.tax_rate ?? 0) / 100) * 100) / 100

        setLiveComputed({
          basicPay: computedBasic,
          overtimePay: computedOT,
          lateDeduction: computedLate,
          sss: computedSSS,
          philhealth: computedPH,
          pagibig: computedPagibig,
          tax: computedTax,
        })
        setAllowance(computedAllowance)
        if (!savedPayslipId) {
          // No saved draft yet — safe to auto-fill, nothing to protect
          setBasicPay(computedBasic)
          setOvertimePay(computedOT)
          setLateDeduction(computedLate)
          setSss(computedSSS)
          setPhilhealth(computedPH)
          setPagibig(computedPagibig)
          setTax(computedTax)
        }


        // Seed otherDeductions from per-log advances (manual time log entries)
        const logAdvances: { id: string; label: string; amount: number }[] = []
        const seenIds = new Set<string>()
        for (const log of parsed) {
          for (const adv of log.advances ?? []) {
            const key = adv.id ?? `${adv.label}-${adv.amount}`
            if (!seenIds.has(key)) {
              seenIds.add(key)
              logAdvances.push({
                id: adv.id ?? crypto.randomUUID(),
                label: adv.label ?? 'Advance',
                amount: Number(adv.amount ?? 0),
              })
            }
          }
        }

        // Only seed if no saved payslip has been hydrated yet — avoid overwriting
        // already-saved deductions when the logs effect races with the draft-load effect.
        if (!savedPayslipId) {
          setOtherDeductions([...logAdvances])
        }
      })
      .catch(() => setLogsError('Failed to load attendance logs'))
      .finally(() => setLogsLoading(false))
  }, [employeeId, periodStart, periodEnd, settings, employees])

  // Reset saved state whenever the user picks a different employee or period
  const resetSaved = () => {
    setSavedPeriodId(null)
    setSavedPayslipId(null)
    setPayslipStatus(null)
  }

  // When employee changes also reset allowance from profile
  const handleEmployeeChange = (id: string) => {
    setEmployeeId(id)
    const emp = employees.find(e => e.id === id)
    setAllowance(emp?.allowance ?? 0)
    resetSaved()
  }

  // ── Load existing draft ───────────────────────────────────────────────────────
  // When the employee or period changes, check the DB for an existing payslip
  // so the Generate tab shows the correct saved state on revisit.
  // Uses the existing GET /api/payroll endpoints:
  //   Step 1: GET /api/payroll          → all periods → find matching date range
  //   Step 2: GET /api/payroll?period_id → payslips   → find this employee's slip
  useEffect(() => {
    if (!employeeId || !periodStart || !periodEnd) return
    if (savedPayslipId) return // already hydrated this session

    ;(async () => {
      try {
        // Step 1: find a period matching the selected date range
        const periodsRes = await fetch('/api/payroll')
        const periodsData = await safeJson(periodsRes)
        if (periodsData.error || !periodsData.periods?.length) return

        const matchedPeriod = periodsData.periods.find(
          (p: PayrollPeriod) => p.period_start === periodStart && p.period_end === periodEnd
        )
        if (!matchedPeriod) return

        // Step 2: get payslips for that period and find this employee's slip
        const slipsRes = await fetch(`/api/payroll?period_id=${matchedPeriod.id}`)
        const slipsData = await safeJson(slipsRes)
        if (slipsData.error || !slipsData.payslips?.length) return

        const slip: Payslip = slipsData.payslips.find((s: Payslip) => s.employee_id === employeeId)
        if (!slip) return

        // Hydrate saved state
        setSavedPeriodId(matchedPeriod.id)
        setSavedPayslipId(slip.id)
        setPayslipStatus(slip.status)
        setBasicPay(slip.basic_pay)
        setOvertimePay(slip.overtime_pay)
        setAllowance(slip.allowance)
        setLateDeduction(slip.late_deduction)
        setSss(slip.sss_contribution)
        setPhilhealth(slip.philhealth_contribution)
        setPagibig(slip.pagibig_contribution)
        setTax(slip.tax_withheld)
        if (Array.isArray(slip.other_deductions)) setOtherDeductions(slip.other_deductions)
      } catch {
        // Silently ignore — user just won't see draft indicator
      }
    })()
  }, [employeeId, periodStart, periodEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save Draft ────────────────────────────────────────────────────────────────
  // Persists the current payslip to the DB via create_period (single employee).
  // If a draft already exists for this employee+period, updates it in place.
  const handleSaveDraft = async () => {
    if (!selectedEmployee) { toast.error('Please select an employee'); return }
    if (!periodStart || !periodEnd) { toast.error('Please set a pay period'); return }
    setSaving(true)
    try {
      if (savedPayslipId) {
        // Already saved — just patch the amounts
        const updates = {
          basic_pay: basicPay, overtime_pay: overtimePay, allowance,
          late_deduction: lateDeduction, sss_contribution: sss,
          philhealth_contribution: philhealth, pagibig_contribution: pagibig,
          tax_withheld: tax, net_pay: netPay,
          other_deductions: otherDeductions.filter(o => o.label.trim()),
        }
        const res = await fetch('/api/payroll', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_payslip', payslip_id: savedPayslipId, updates }),
        })
        const data = await safeJson(res)
        if (data.error) throw new Error(data.error)
        // Upsert late fee journal entry (delete old one first, then re-post with latest amount)
        await deleteLateFeeJournalEntry(savedPayslipId)
        await postLateFeeJournalEntry({
          payslipId: savedPayslipId,
          employeeName: selectedEmployee.name,
          amount: lateDeduction,
          periodStart,
          periodEnd,
        })
        toast.success('Draft updated')
      } else {
        // First save — create a new period for this single employee
        const res = await fetch('/api/payroll', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_period',
            period_start: periodStart,
            period_end: periodEnd,
            employee_ids: [selectedEmployee.id],
          }),
        })
        const data = await safeJson(res)
        if (data.error) throw new Error(data.error)
        const periodId: string = data.period?.id
        const payslipId: string = data.payslips?.[0]?.id
        if (!periodId || !payslipId) throw new Error('Unexpected response from server')
        setSavedPeriodId(periodId)
        setSavedPayslipId(payslipId)
        setPayslipStatus('draft')
        if (selectedTpl?.id) savePeriodTemplate(periodId, selectedTpl.id)
        // Immediately patch the computed amounts onto the new payslip
        const updates = {
          basic_pay: basicPay, overtime_pay: overtimePay, allowance,
          late_deduction: lateDeduction, sss_contribution: sss,
          philhealth_contribution: philhealth, pagibig_contribution: pagibig,
          tax_withheld: tax, net_pay: netPay,
          other_deductions: otherDeductions.filter(o => o.label.trim()),
        }
        const patchRes = await fetch('/api/payroll', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_payslip', payslip_id: payslipId, updates }),
        })
        const patchData = await safeJson(patchRes)
        if (patchData.error) throw new Error(patchData.error)
        // Post late fee journal entry for the newly created payslip
        await postLateFeeJournalEntry({
          payslipId,
          employeeName: selectedEmployee.name,
          amount: lateDeduction,
          periodStart,
          periodEnd,
        })
        toast.success('Payslip saved as draft')
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────────
  // Locks the saved payslip period so it can no longer be edited.
  const handleFinalize = async () => {
    if (!savedPeriodId) return
    if (!confirm('Finalize this payslip? It will be locked and can no longer be edited.')) return
    setFinalizing(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize_period', period_id: savedPeriodId }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslipStatus('released')
      // Refresh the journal entry so it reflects the final locked amounts
      if (savedPayslipId && selectedEmployee) {
        await deleteLateFeeJournalEntry(savedPayslipId)
        await postLateFeeJournalEntry({
          payslipId: savedPayslipId,
          employeeName: selectedEmployee.name,
          amount: lateDeduction,
          periodStart,
          periodEnd,
        })
      }
      toast.success('Payslip finalized and locked')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to finalize')
    } finally {
      setFinalizing(false)
    }
  }

  // ── Unlock (revert finalized → draft) ────────────────────────────────────────
  const handleUnlockDraft = async () => {
    if (!savedPayslipId) return
    if (!confirm('Unlock this payslip for editing? It will be set back to draft status.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payslip', payslip_id: savedPayslipId, updates: { status: 'draft' } }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslipStatus('draft')
      toast.success('Payslip unlocked — you can now edit it')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to unlock payslip')
    } finally {
      setSaving(false)
    }
  }

  // ── Void finalized payslip from the generator panel ──────────────────────────
  const handleVoidFinalized = async () => {
    if (!savedPayslipId) return
    const empName = employees.find(e => e.id === employeeId)?.name ?? 'this employee'
    if (!confirm(`Void payslip for ${empName}? This will permanently delete it and reverse the late fee journal entry.`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void_payslip', payslip_id: savedPayslipId }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      // Reverse the late fee journal entry
      await deleteLateFeeJournalEntry(savedPayslipId)
      // Reset generator state
      setSavedPayslipId(null)
      setSavedPeriodId(null)
      setPayslipStatus(null)
      toast.success('Payslip voided and journal entry reversed')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to void payslip')
    } finally {
      setSaving(false)
    }
  }

  const isFinalized = payslipStatus === 'released'

  const gross = basicPay + overtimePay + allowance
  const otherTotal = otherDeductions.reduce((s, o) => s + (o.amount || 0), 0)
  const totalDeductions = lateDeduction + sss + philhealth + pagibig + tax + otherTotal
  const netPay = gross - totalDeductions

  const addDeduction = () => { setOtherDeductions(prev => [...prev, { id: crypto.randomUUID(), label: '', amount: 0 }]) }
  const updateDeduction = (id: string, patch: Partial<{ label: string; amount: number }>) => {
    setOtherDeductions(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  const removeDeduction = (id: string) => { setOtherDeductions(prev => prev.filter(o => o.id !== id)) }

  const applyLiveComputed = () => {
    if (!liveComputed) return
    setBasicPay(liveComputed.basicPay)
    setOvertimePay(liveComputed.overtimePay)
    setLateDeduction(liveComputed.lateDeduction)
    setSss(liveComputed.sss)
    setPhilhealth(liveComputed.philhealth)
    setPagibig(liveComputed.pagibig)
    setTax(liveComputed.tax)
    toast.success('Recalculated from current attendance data')
  }

  const isStaleVsAttendance =
    !!liveComputed &&
    (Math.round(liveComputed.basicPay * 100) !== Math.round(basicPay * 100) ||
      Math.round(liveComputed.overtimePay * 100) !== Math.round(overtimePay * 100) ||
      Math.round(liveComputed.lateDeduction * 100) !== Math.round(lateDeduction * 100))

  const selectedEmployee = employees.find(e => e.id === employeeId)
  const selectedTpl = templates.find(t => t.id === templateId) ?? null
  const accentColor = selectedTpl?.primaryColor ?? '#4f46e5'

  // Attendance summary stats
  const totalDays = logs.length
  const totalHours = logs.reduce((s, l) => s + (l.total_hours ?? 0), 0)
  const lateDays = logs.filter(l => (l.late_minutes ?? 0) > 0).length
  const totalLateMin = logs.reduce((s, l) => s + (l.late_minutes ?? 0), 0)

  // Shift breakdown for preview
  const shiftBreakdown: Record<string, { days: number; hours: number; lateMin: number }> = {}
  for (const l of logs) {
    const k = l.shift_name || 'Unassigned'
    if (!shiftBreakdown[k]) shiftBreakdown[k] = { days: 0, hours: 0, lateMin: 0 }
    shiftBreakdown[k].days++
    shiftBreakdown[k].hours += l.total_hours ?? 0
    shiftBreakdown[k].lateMin += l.late_minutes ?? 0
  }

  const handlePrint = () => {
    if (!selectedEmployee) { toast.error('Please select an employee'); return }
    const fakeSlip: Payslip = {
      id: 'preview', employee_id: employeeId, period_id: 'quick',
      basic_pay: basicPay, overtime_pay: overtimePay, allowance,
      late_deduction: lateDeduction, sss_contribution: sss,
      philhealth_contribution: philhealth, pagibig_contribution: pagibig,
      tax_withheld: tax, net_pay: netPay,
      other_deductions: otherDeductions.filter(o => o.label.trim()),
      status: 'draft', employees: selectedEmployee,
    }
    const fakePeriod: PayrollPeriod = {
      id: 'quick', period_start: periodStart, period_end: periodEnd,
      cutoff: null, status: 'draft', created_at: new Date().toISOString(),
      payslip_count: 1, total_net_pay: netPay, finalized_count: 0,
    }
    const lateLogs = logs.filter(l => (l.late_minutes ?? 0) > 0).map(l => ({ date: l.date, minutes: l.late_minutes! }))
    printPayslip(fakeSlip, fakePeriod, selectedTpl, lateLogs, settings?.payslip_notes, shopTimezone, logs)
  }

  // (EditField is defined outside this component — see below QuickPayslipGenerator)

  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-visible md:overflow-hidden">

      {/* ── Left panel: controls ── */}
      <div className="w-full md:w-[400px] flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-white flex flex-col overflow-visible md:overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Generate Payslip</h2>
          <p className="text-xs text-gray-400 mt-0.5">Picks up real attendance data — all amounts auto-computed.</p>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Employee */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Employee</label>
            {empLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
            ) : (
              <select value={employeeId} onChange={e => handleEmployeeChange(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employee_no ? ` (#${e.employee_no})` : ''}</option>)}
              </select>
            )}
            {selectedEmployee && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
                <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center font-semibold text-indigo-800 text-[11px] flex-shrink-0">
                  {selectedEmployee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{selectedEmployee.name}</p>
                  <p className="text-indigo-400">{selectedEmployee.role}{selectedEmployee.employment_type ? ` · ${selectedEmployee.employment_type}` : ''}{selectedEmployee.hourly_rate ? ` · ₱${selectedEmployee.hourly_rate}/hr` : ''}</p>
                </div>
              </div>
            )}
          </div>

          {/* Pay Period */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Pay Period</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input type="date" value={periodStart} onChange={e => { setPeriodStart(e.target.value); resetSaved() }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input type="date" value={periodEnd} onChange={e => { setPeriodEnd(e.target.value); resetSaved() }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
          </div>

          {/* Attendance fetch status */}
          {employeeId && (
            <div>
              {logsLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-600">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  Fetching attendance logs…
                </div>
              ) : logsError ? (
                <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {logsError}
                </div>
              ) : logs.length === 0 ? (
                <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  No attendance logs found for this period. Amounts default to ₱0.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { val: totalDays, lbl: 'Days' },
                    { val: totalHours.toFixed(1) + 'h', lbl: 'Hours' },
                    { val: lateDays, lbl: 'Late days', alert: lateDays > 0 },
                    { val: totalLateMin + ' min', lbl: 'Late total', alert: totalLateMin > 0 },
                  ].map(({ val, lbl, alert }) => (
                    <div key={lbl} className={`rounded-xl px-2 py-2 text-center ${alert ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <p className={`text-sm font-bold ${alert ? 'text-red-600' : 'text-gray-800'}`}>{val}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{lbl}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Payslip Format */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Format</label>
            <div className="flex gap-3">
              {(['payslip1', 'payslip2'] as const).map((f, i) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${format === f ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-200'}`}>
                  <div className={`w-full h-10 rounded-lg p-1.5 ${format === f ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                    {i === 0 ? (
                      <div className="space-y-1">
                        <div className={`h-1 w-10 rounded ${format === f ? 'bg-indigo-400' : 'bg-gray-300'}`} />
                        <div className={`h-0.5 w-full rounded ${format === f ? 'bg-indigo-200' : 'bg-gray-200'}`} />
                        <div className={`h-0.5 w-full rounded ${format === f ? 'bg-indigo-200' : 'bg-gray-200'}`} />
                        <div className={`h-0.5 w-3/4 rounded ${format === f ? 'bg-indigo-200' : 'bg-gray-200'}`} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        {[...Array(4)].map((_, j) => <div key={j} className={`h-1 rounded ${format === f ? 'bg-indigo-200' : 'bg-gray-200'}`} />)}
                      </div>
                    )}
                  </div>
                  Payslip {i + 1}
                </button>
              ))}
            </div>
            {templates.length > 0 && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Template</label>
                <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                  <option value="">Default layout</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Finalized lock banner */}
          {isFinalized && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                This payslip is finalized. Unlock to make edits or void it.
              </div>
              <button
                onClick={handleUnlockDraft}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-600 border border-amber-300 bg-white rounded-lg hover:bg-amber-50 transition-colors flex-shrink-0">
                <Pencil className="w-3 h-3" /> Unlock
              </button>
            </div>
          )}

          {/* Stale draft banner — saved values no longer match current attendance data */}
          {!isFinalized && isStaleVsAttendance && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Attendance data has changed since this draft was saved — earnings shown may be out of date.
              </div>
              <button
                onClick={applyLiveComputed}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-300 bg-white rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0">
                <RefreshCw className="w-3 h-3" /> Recalculate
              </button>
            </div>
          )}

          {/* Earnings — auto-filled, editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Earnings</label>
              <span className="text-[10px] text-indigo-500 font-medium">Auto-computed · editable</span>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <EditField label="Basic Pay" value={basicPay} onChange={setBasicPay} isFinalized={false} />
              <EditField label="Overtime Pay" value={overtimePay} onChange={setOvertimePay} isFinalized={false} />
              <EditField label="Allowance" value={allowance} onChange={setAllowance} isFinalized={false} />
              <div className="flex items-center justify-between pt-2 pb-1">
                <span className="text-sm font-semibold text-gray-700">Gross Pay</span>
                <span className="text-sm font-bold text-gray-900">{fmt(gross)}</span>
              </div>
            </div>
          </div>

          {/* Deductions — auto-filled, editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Deductions</label>
              <span className="text-[10px] text-indigo-500 font-medium">Auto-computed · editable</span>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <EditField label="Late Deduction" value={lateDeduction} onChange={setLateDeduction} negative isFinalized={false} />
              <EditField label="SSS" value={sss} onChange={setSss} negative isFinalized={false} />
              <EditField label="PhilHealth" value={philhealth} onChange={setPhilhealth} negative isFinalized={false} />
              <EditField label="Pag-IBIG" value={pagibig} onChange={setPagibig} negative isFinalized={false} />
              <EditField label="Withholding Tax" value={tax} onChange={setTax} negative isFinalized={false} />
              {otherDeductions.map(o => (
                <div key={o.id} className="flex items-center gap-2 py-2 border-b border-gray-100">
                  <span className="text-xs text-red-400">−</span>
                  <input type="text" value={o.label} onChange={e => updateDeduction(o.id, { label: e.target.value })}
                    placeholder="Deduction name…"
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  <span className="text-xs text-gray-400">₱</span>
                  <input type="number" step="0.01" min="0" value={o.amount || 0}
                    onChange={e => updateDeduction(o.id, { amount: parseFloat(e.target.value) || 0 })}
                    className="w-24 px-2 py-1 text-xs text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  <button onClick={() => removeDeduction(o.id)} className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addDeduction} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium my-2 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add deduction
              </button>
              <div className="flex items-center justify-between pt-1 pb-2 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-700">Total Deductions</span>
                <span className="text-sm font-bold text-red-600">−{fmt(totalDeductions)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Right panel: live preview ── */}
      <div className="flex-1 min-w-0 bg-gray-50 flex flex-col overflow-visible md:overflow-hidden">
        <div className="px-4 md:px-6 py-4 bg-white border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">Live Preview</h3>
              {isFinalized && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <Lock className="w-3 h-3" /> Finalized
                </span>
              )}
              {payslipStatus === 'draft' && !isFinalized && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                  <Edit3 className="w-3 h-3" /> Draft Saved
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {logs.length > 0 ? `Based on ${logs.length} attendance log${logs.length !== 1 ? 's' : ''}` : 'Select employee and period to load attendance'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {/* Print — always available */}
            <button onClick={handlePrint} disabled={!employeeId || logsLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
            {/* Save Draft — visible when not finalized */}
            {!isFinalized && (
              <button onClick={handleSaveDraft} disabled={!employeeId || logsLoading || saving || finalizing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-xl hover:bg-indigo-100 disabled:opacity-40 transition-colors">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savedPayslipId ? 'Update Draft' : 'Save Draft'}
              </button>
            )}
            {/* Void — only shown when finalized and a payslip exists */}
            {isFinalized && savedPayslipId && (
              <button onClick={handleVoidFinalized} disabled={saving || finalizing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-300 text-red-600 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-40 transition-colors">
                <Trash2 className="w-4 h-4" /> Void
              </button>
            )}
            {/* Finalize — only shown after saving a draft */}
            {savedPeriodId && !isFinalized && (
              <button onClick={handleFinalize} disabled={finalizing || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                {finalizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Finalize
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!employeeId ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 pb-12">
              <Users className="w-10 h-10 mb-3 text-gray-300" />
              <p className="font-medium">Select an employee to get started</p>
              <p className="text-sm mt-1">Attendance data will be fetched automatically</p>
            </div>
          ) : logsLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 pb-12">
              <RefreshCw className="w-6 h-6 animate-spin mb-3 text-indigo-400" />
              <p className="text-sm">Loading attendance data…</p>
            </div>
          ) : (
            <div className="max-w-lg mx-auto space-y-4">

              {/* Pay card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                {selectedTpl?.companyName && <p className="text-xs font-bold text-gray-700 mb-0.5">{selectedTpl.companyName}</p>}
                {selectedTpl?.companyAddress && <p className="text-xs text-gray-400 mb-2">{selectedTpl.companyAddress}</p>}

                <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-xl font-extrabold" style={{ color: accentColor }}>PAYSLIP</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(periodStart)} – {fmtDate(periodEnd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{selectedEmployee?.name}</p>
                    <p className="text-xs text-gray-400">{selectedEmployee?.role}</p>
                    {selectedEmployee?.employee_no && <p className="text-xs text-gray-400">#{selectedEmployee.employee_no}</p>}
                  </div>
                </div>

                {/* Summary strip */}
                {logs.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { val: totalDays, lbl: 'Days' },
                      { val: totalHours.toFixed(1) + 'h', lbl: 'Hours' },
                      { val: lateDays, lbl: 'Late days', alert: lateDays > 0 },
                      { val: totalLateMin + ' min', lbl: 'Late total', alert: totalLateMin > 0 },
                    ].map(({ val, lbl, alert }) => (
                      <div key={lbl} className={`rounded-lg px-2 py-1.5 text-center ${alert ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <p className={`text-xs font-bold ${alert ? 'text-red-600' : 'text-gray-700'}`}>{val}</p>
                        <p className="text-[9px] text-gray-400">{lbl}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Resolve template visibility flags for preview (mirrors printPayslip logic) */}
                {(() => {
                  const showOT      = selectedTpl ? selectedTpl.showOvertimePay  : true
                  const showAllow   = selectedTpl ? selectedTpl.showAllowance     : true
                  const showLate    = selectedTpl ? selectedTpl.showLateDeduction : true
                  const showSSS     = selectedTpl ? selectedTpl.showSSS           : true
                  const showPH      = selectedTpl ? selectedTpl.showPhilHealth    : true
                  const showPagibig = selectedTpl ? selectedTpl.showPagibig       : true
                  const showTax     = selectedTpl ? selectedTpl.showTax           : true

                  const earningsRows: [string, number][] = [
                    ['Basic Pay', basicPay],
                    ...(showOT    ? [['Overtime Pay', overtimePay] as [string, number]] : []),
                    ...(showAllow ? [['Allowance',    allowance]   as [string, number]] : []),
                  ]
                  const deductionRows: [string, number][] = [
                    ...(showLate    ? [['Late Deduction', lateDeduction]  as [string, number]] : []),
                    ...(showSSS     ? [['SSS',            sss]            as [string, number]] : []),
                    ...(showPH      ? [['PhilHealth',     philhealth]     as [string, number]] : []),
                    ...(showPagibig ? [['Pag-IBIG',       pagibig]        as [string, number]] : []),
                    ...(showTax     ? [['Tax',            tax]            as [string, number]] : []),
                    ...otherDeductions.filter(o => o.label.trim()).map(o => [o.label, o.amount] as [string, number]),
                  ]

                  return format === 'payslip1' ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 pb-1 border-b-2" style={{ borderColor: accentColor }}>Earnings</p>
                      {earningsRows.filter(([,v]) => v > 0).map(([l, v], i) => (
                        <div key={l + '-' + i} className="flex justify-between py-1 border-b border-gray-50 text-xs"><span className="text-gray-500">{l}</span><span>{fmt(v)}</span></div>
                      ))}
                      <div className="flex justify-between py-1.5 text-xs font-bold border-t border-gray-200 mt-1"><span>Gross Pay</span><span>{fmt(gross)}</span></div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1 pb-1 border-b-2" style={{ borderColor: accentColor }}>Deductions</p>
                      {deductionRows.filter(([,v]) => v > 0).map(([l, v], i) => (
                        <div key={l + '-' + i} className="flex justify-between py-1 border-b border-gray-50 text-xs"><span className="text-gray-500">{l}</span><span className="text-red-600">−{fmt(v)}</span></div>
                      ))}
                      <div className="flex justify-between py-1.5 text-xs font-bold border-t border-gray-200 mt-1"><span>Total Deductions</span><span className="text-red-600">−{fmt(totalDeductions)}</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 pb-1 border-b-2" style={{ borderColor: accentColor }}>Earnings</p>
                        {earningsRows.filter(([,v]) => v > 0).map(([l, v], i) => (
                          <div key={l + '-' + i} className="flex justify-between py-1 border-b border-gray-50 text-xs"><span className="text-gray-500">{l}</span><span>{fmt(v)}</span></div>
                        ))}
                        <div className="flex justify-between py-1.5 text-xs font-bold border-t border-gray-200 mt-1"><span>Gross</span><span>{fmt(gross)}</span></div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 pb-1 border-b-2" style={{ borderColor: accentColor }}>Deductions</p>
                        {deductionRows.filter(([,v]) => v > 0).map(([l, v], i) => (
                          <div key={l + '-' + i} className="flex justify-between py-1 border-b border-gray-50 text-xs"><span className="text-gray-500">{l}</span><span className="text-red-500">−{fmt(v)}</span></div>
                        ))}
                        <div className="flex justify-between py-1.5 text-xs font-bold border-t border-gray-200 mt-1"><span>Total</span><span className="text-red-600">−{fmt(totalDeductions)}</span></div>
                      </div>
                    </div>
                  )
                })()}

                <div className="flex justify-between items-center mt-4 px-4 py-3 rounded-xl text-white text-sm font-bold" style={{ backgroundColor: accentColor }}>
                  <span>NET PAY</span><span className="text-base">{fmt(netPay)}</span>
                </div>
                {selectedTpl?.footerNote && <p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100">{selectedTpl.footerNote}</p>}
              </div>

              {/* Shift breakdown card */}
              {Object.keys(shiftBreakdown).length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Hours by Shift</p>
                  <div className="space-y-2">
                    {Object.entries(shiftBreakdown).map(([name, v]) => (
                      <div key={name} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-gray-800">{name}</span>
                          <span className="text-xs text-gray-400 ml-2">{v.days} day{v.days !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-medium text-gray-700">{v.hours.toFixed(2)}h</span>
                          {v.lateMin > 0
                            ? <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">{v.lateMin} min late</span>
                            : <span className="text-emerald-500">✓ on time</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily attendance log card */}
              {logs.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Daily Attendance</p>
                  <div className="space-y-1.5">
                    {logs.map(l => {
                      const isLate = (l.late_minutes ?? 0) > 0
                      const [yr, mth, dd] = l.date.split('-').map(Number)
                      const DSHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                      const MSHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                      const dow = new Date(yr, mth - 1, dd).getDay()
                      const dateLabel = `${DSHORT[dow]}, ${MSHORT[mth-1]} ${dd}`
                      const fmtT = (iso: string) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: shopTimezone, hour: '2-digit', minute: '2-digit' }) } catch { return '—' } }
                      return (
                        <div key={l.date + l.clock_in} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isLate ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                          <div className="w-28 text-gray-600 font-medium flex-shrink-0">{dateLabel}</div>
                          <div className="flex-1 text-gray-400 truncate">{l.shift_name || '—'}</div>
                          <div className="text-gray-500 flex-shrink-0">{fmtT(l.clock_in)} – {l.clock_out ? fmtT(l.clock_out) : '?'}</div>
                          <div className="text-gray-600 font-medium flex-shrink-0 w-12 text-right">{l.total_hours != null ? l.total_hours.toFixed(2) + 'h' : '—'}</div>
                          <div className="flex-shrink-0 w-20 text-right">
                            {isLate
                              ? <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">{l.late_minutes} min</span>
                              : <span className="text-emerald-500">✓</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Payslip Records Tab ──────────────────────────────────────────────────────
// Browse past payroll periods and drill into a period to view, print, unlock,
// or void its finalized payslips. This is the dedicated place to find
// finalized payslips — the Generate tab only ever shows one employee/period
// at a time, so there was previously no way to see everything that had
// already been finalized.

function PayslipRecordsTab() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null)
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loadingSlips, setLoadingSlips] = useState(false)
  const [search, setSearch] = useState('')
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true)
    try {
      const res = await fetch('/api/payroll')
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      const list: PayrollPeriod[] = data.periods ?? []
      list.sort((a, b) => b.period_start.localeCompare(a.period_start))
      setPeriods(list)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payroll periods')
    } finally {
      setLoadingPeriods(false)
    }
  }, [])

  useEffect(() => { loadPeriods() }, [loadPeriods])

  useEffect(() => {
    fetch('/api/shop')
      .then(r => r.json())
      .then(data => { if (data?.shop?.timezone) setShopTimezone(data.shop.timezone) })
      .catch(() => {})
  }, [])

  const openPeriod = async (period: PayrollPeriod) => {
    setSelectedPeriod(period)
    setLoadingSlips(true)
    setSearch('')
    setSelectedIds(new Set())
    try {
      const res = await fetch(`/api/payroll?period_id=${period.id}`)
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(data.payslips ?? [])
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payslips')
      setPayslips([])
    } finally {
      setLoadingSlips(false)
    }
  }

  const handleUpdate = async (id: string, updates: Partial<Payslip>) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payslip', payslip_id: id, updates }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(prev => prev.map(s => s.id === id ? { ...s, ...updates } as Payslip : s))
      if ((updates as any).status === 'draft') toast.success('Payslip unlocked — set back to draft')
      // Finalized counts on the period list can shift after an unlock — resync.
      if ((updates as any).status) loadPeriods()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update payslip')
    }
  }

  const handleFinalizeSingle = async (id: string) => {
    if (!confirm('Finalize this payslip? It will be locked and can no longer be edited.')) return
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize_payslip', payslip_id: id }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(prev => prev.map(s => s.id === id ? { ...s, status: 'released' } as Payslip : s))
      toast.success('Payslip finalized')
      // Period's finalized_count / status can shift once every payslip is done — resync.
      loadPeriods()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to finalize payslip')
    }
  }

  const handleVoid = async (id: string) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void_payslip', payslip_id: id }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(prev => prev.filter(s => s.id !== id))
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toast.success('Payslip deleted')
      loadPeriods()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete payslip')
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} selected payslip${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkDeleting(true)
    let succeeded = 0
    let failed = 0
    for (const id of ids) {
      try {
        const res = await fetch('/api/payroll', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'void_payslip', payslip_id: id }),
        })
        const data = await safeJson(res)
        if (data.error) throw new Error(data.error)
        await deleteLateFeeJournalEntry(id)
        succeeded++
      } catch {
        failed++
      }
    }
    setPayslips(prev => prev.filter(s => !ids.includes(s.id)))
    setSelectedIds(new Set())
    setBulkDeleting(false)
    if (succeeded > 0) toast.success(`${succeeded} payslip${succeeded !== 1 ? 's' : ''} deleted`)
    if (failed > 0) toast.error(`Failed to delete ${failed} payslip${failed !== 1 ? 's' : ''}`)
    loadPeriods()
    if (selectedPeriod) openPeriod(selectedPeriod)
  }

  const handleDeletePeriod = async (period: PayrollPeriod) => {
    if (period.finalized_count > 0) {
      toast.error('Finalized periods can\'t be deleted — void or unlock the payslips first.')
      return
    }
    if (!confirm(`Delete the record for ${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}? This removes all its payslips and related P&L entries. This cannot be undone.`)) return

    setDeletingPeriodId(period.id)
    try {
      const res = await fetch(`/api/payroll?period_id=${period.id}`, { method: 'DELETE' })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPeriods(prev => prev.filter(pd => pd.id !== period.id))
      toast.success('Payroll record deleted')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete payroll record')
    } finally {
      setDeletingPeriodId(null)
    }
  }

  const handlePrintSlip = (slip: Payslip) => {
    if (!selectedPeriod) return
    const tpl = getTemplateForPeriod(selectedPeriod.id)
    printPayslip(slip, selectedPeriod, tpl, undefined, undefined, shopTimezone)
  }

  const filteredSlips = payslips
    .filter(s => !search.trim() || s.employees.name.toLowerCase().includes(search.trim().toLowerCase()))

  const allVisibleSelected = filteredSlips.length > 0 && filteredSlips.every(s => selectedIds.has(s.id))

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        filteredSlips.forEach(s => next.delete(s.id))
        return next
      }
      const next = new Set(prev)
      filteredSlips.forEach(s => next.add(s.id))
      return next
    })
  }

  // ── Period list view ──────────────────────────────────────────────────────
  if (!selectedPeriod) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Payslip Records</h2>
            <p className="text-sm text-gray-400 mt-0.5">Browse past payroll periods and manage draft &amp; finalized payslips.</p>
          </div>
          <button onClick={loadPeriods} disabled={loadingPeriods}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPeriods ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loadingPeriods ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading periods…
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No payroll periods yet.</p>
            <p className="text-xs mt-1">Generate a payslip first — periods will show up here once created.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {periods.map(p => {
              const isFinalized = p.finalized_count > 0
              return (
                <div key={p.id} onClick={() => openPeriod(p)}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all text-left cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.finalized_count} finalized · {p.payslip_count} total payslip{p.payslip_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-400">Total Net Pay</p>
                    <p className="text-sm font-semibold text-gray-800">{fmt(p.total_net_pay)}</p>
                  </div>
                  {p.finalized_count > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> {p.finalized_count} Finalized
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                      <Edit3 className="w-3 h-3" /> Draft only
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePeriod(p) }}
                    disabled={deletingPeriodId === p.id || isFinalized}
                    title={isFinalized ? 'Finalized periods can\'t be deleted — void the payslips first' : 'Delete this record'}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors flex-shrink-0"
                  >
                    {deletingPeriodId === p.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Period detail view ────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => setSelectedPeriod(null)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to periods
      </button>

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900">
          {fmtDate(selectedPeriod.period_start)} – {fmtDate(selectedPeriod.period_end)}
        </h2>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        {payslips.length} payslip{payslips.length !== 1 ? 's' : ''} in this period · showing draft &amp; finalized
      </p>

      <input
        type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by employee name…"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {filteredSlips.length > 0 && (
        <div className="flex items-center justify-between mb-3 px-1">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400"
            />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </label>
          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              {bulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete {selectedIds.size} Selected
            </button>
          )}
        </div>
      )}

      {loadingSlips ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading payslips…
        </div>
      ) : filteredSlips.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Lock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No payslips {search ? 'match your search' : 'for this period'}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSlips.map(slip => (
            <PayslipRow
              key={slip.id}
              slip={slip}
              onUpdate={handleUpdate}
              onPrint={handlePrintSlip}
              onVoid={handleVoid}
              onFinalize={handleFinalizeSingle}
              selected={selectedIds.has(slip.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'generate' | 'attendance' | 'records' | 'templates' | 'settings'


export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<Tab>('generate')
  const [templates, setTemplates] = useState<PayslipTemplate[]>([])
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')

  useEffect(() => {
    fetch('/api/shop')
      .then(r => r.json())
      .then(data => { if (data?.shop?.timezone) setShopTimezone(data.shop.timezone) })
      .catch(() => {})
  }, [])

  useEffect(() => { setTemplates(loadTemplates()) }, [])

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'generate', label: 'Generate', icon: FileDown },
    { id: 'attendance', label: 'Attendance', icon: CalendarDays },
    { id: 'records', label: 'Records', icon: CheckCircle2 },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex flex-col md:flex-row md:items-center md:px-6 gap-0 md:gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full md:w-auto flex items-center gap-2 px-6 md:px-4 py-3 md:py-3.5 text-sm font-medium border-l-4 md:border-l-0 md:border-b-2 transition-colors
                ${active
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/60 md:bg-transparent'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 md:hover:bg-transparent'}`}
            >
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'attendance' && <div className="flex-1 overflow-y-auto"><AttendanceTab /></div>}
      {activeTab === 'generate' && <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden"><QuickPayslipGenerator /></div>}
      {activeTab === 'records' && <div className="flex-1 overflow-y-auto"><PayslipRecordsTab /></div>}
      {activeTab === 'templates' && <div className="flex-1 overflow-y-auto"><TemplatesTab /></div>}
      {activeTab === 'settings' && <div className="flex-1 overflow-y-auto"><SettingsTab /></div>}

    </div>
  )
}