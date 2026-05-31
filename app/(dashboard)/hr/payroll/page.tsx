'use client'

// /app/(dashboard)/hr/payroll/page.tsx

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Lock, Unlock,
  Trash2, Printer, RefreshCw, Users, Clock, AlertCircle,
  CheckCircle2, Edit3, X, Check, Settings, CalendarDays,
  Save, ChevronDown, UserPlus, LayoutTemplate, Download,
  Building2, Palette, Eye, EyeOff, FileDown,
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
  employees?: { name: string; role: string; employee_no: string | null }
}

interface PayrollSettings {
  late_deduction_per_minute: number
  sss_rate: number
  philhealth_rate: number
  pagibig_flat: number
  overtime_multiplier: number
  tax_rate: number
}

// ─── Other Deductions ─────────────────────────────────────────────────────────

interface OtherDeduction {
  id: string
  label: string
  amount: number
}

const OTHER_DEDUCTIONS_KEY = 'payroll_other_deductions'

function loadOtherDeductions(): OtherDeduction[] {
  try { return JSON.parse(localStorage.getItem(OTHER_DEDUCTIONS_KEY) ?? '[]') } catch { return [] }
}

function saveOtherDeductions(items: OtherDeduction[]) {
  try { localStorage.setItem(OTHER_DEDUCTIONS_KEY, JSON.stringify(items)) } catch {}
}

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

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

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

function PayslipRow({ slip, onUpdate, onPrint, onVoid }: {
  slip: Payslip
  onUpdate: (id: string, updates: Partial<Payslip>) => Promise<void>
  onPrint: (slip: Payslip) => void
  onVoid?: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const isFinalized = slip.status === 'released'

  const handleVoid = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onVoid) return
    if (!confirm(`Void payslip for ${slip.employees.name}? This will delete it and remove all related financial entries.`)) return
    setVoiding(true)
    await onVoid(slip.id)
    setVoiding(false)
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
    <div className={`border rounded-lg overflow-hidden transition-all ${isFinalized ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors" onClick={() => setExpanded(v => !v)}>
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
            <div className="flex items-center gap-2">
              {isFinalized && <span className="text-xs text-emerald-600 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalized</span>}
              {isFinalized && onVoid && (
                <button onClick={handleVoid} disabled={voiding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                  {voiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Void
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

function printPayslip(slip: Payslip, period: PayrollPeriod, tpl: PayslipTemplate | null = null) {
  // ── Other (free-form) deductions ──
  const otherDeductions = loadOtherDeductions().filter(o => o.label.trim() && o.amount > 0)

  // ── Resolve template settings (fall back to "show everything") ──
  const color        = tpl?.primaryColor   ?? '#111111'
  const companyName  = tpl?.companyName    ?? ''
  const companyAddr  = tpl?.companyAddress ?? ''
  const footerNote   = tpl?.footerNote     ?? ''
  const showEmpNo    = tpl ? tpl.showEmployeeNo    : true
  const showOT       = tpl ? tpl.showOvertimePay   : true
  const showAllow    = tpl ? tpl.showAllowance      : true
  const showLate     = tpl ? tpl.showLateDeduction  : true
  const showSSS      = tpl ? tpl.showSSS            : true
  const showPH       = tpl ? tpl.showPhilHealth     : true
  const showPagibig  = tpl ? tpl.showPagibig        : true
  const showTax      = tpl ? tpl.showTax            : true

  // ── Totals always use real values so net pay is always accurate ──
  const gross      = slip.basic_pay + slip.overtime_pay + slip.allowance
  const otherTotal = otherDeductions.reduce((sum, o) => sum + o.amount, 0)
  const deductions = slip.late_deduction + slip.sss_contribution
                   + slip.philhealth_contribution + slip.pagibig_contribution
                   + slip.tax_withheld + otherTotal

  const html = `<!DOCTYPE html><html><head><title>Payslip — ${slip.employees.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#111;padding:32px;max-width:480px;margin:0 auto}
  .accent{color:${color}}
  .accent-border{border-color:${color}}
  h1{font-size:18px;font-weight:700;margin-bottom:2px}
  .company{font-size:11px;color:#555;margin-bottom:4px}
  .period{font-size:11px;color:#666;margin-bottom:24px}
  .section-title{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#888;font-weight:600;margin:16px 0 6px;padding-bottom:4px;border-bottom:2px solid ${color}}
  .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0}
  .row.total{border-top:1px solid #ddd;border-bottom:2px solid #111;font-weight:700;padding-top:8px;margin-top:4px}
  .net{display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:700;border-top:3px solid ${color};margin-top:8px;color:${color}}
  .employee{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e0e0e0}
  .employee p{margin:2px 0}
  .footer{margin-top:32px;font-size:10px;color:#aaa}
  @media print{body{padding:16px}}
</style>
</head><body>
${companyName ? `<p class="company" style="font-weight:600;font-size:13px">${companyName}</p>` : ''}
${companyAddr ? `<p class="company">${companyAddr}</p>` : ''}
<h1 class="accent">PAYSLIP</h1>
<p class="period">${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}</p>

<div class="employee">
  <p><strong>${slip.employees.name}</strong></p>
  ${showEmpNo && slip.employees.employee_no ? `<p>Employee #${slip.employees.employee_no}</p>` : ''}
  <p>${slip.employees.role}</p>
  ${slip.employees.employment_type ? `<p>${slip.employees.employment_type.replace('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}</p>` : ''}
</div>

<p class="section-title">Earnings</p>
<div class="row"><span>Basic Pay</span><span>${fmt(slip.basic_pay)}</span></div>
${showOT && slip.overtime_pay > 0 ? `<div class="row"><span>Overtime Pay</span><span>${fmt(slip.overtime_pay)}</span></div>` : ''}
${showAllow && slip.allowance > 0 ? `<div class="row"><span>Allowance</span><span>${fmt(slip.allowance)}</span></div>` : ''}
<div class="row total"><span>Gross Pay</span><span>${fmt(gross)}</span></div>

<p class="section-title">Deductions</p>
${showLate && slip.late_deduction > 0 ? `<div class="row"><span>Late Deduction</span><span>–${fmt(slip.late_deduction)}</span></div>` : ''}
${showSSS ? `<div class="row"><span>SSS</span><span>–${fmt(slip.sss_contribution)}</span></div>` : ''}
${showPH ? `<div class="row"><span>PhilHealth</span><span>–${fmt(slip.philhealth_contribution)}</span></div>` : ''}
${showPagibig ? `<div class="row"><span>Pag-IBIG</span><span>–${fmt(slip.pagibig_contribution)}</span></div>` : ''}
${showTax && slip.tax_withheld > 0 ? `<div class="row"><span>Withholding Tax</span><span>–${fmt(slip.tax_withheld)}</span></div>` : ''}
${otherDeductions.map(o => `<div class="row"><span>${o.label}</span><span>–${fmt(o.amount)}</span></div>`).join('')}
<div class="row total"><span>Total Deductions</span><span>–${fmt(deductions)}</span></div>

<div class="net"><span>NET PAY</span><span>${fmt(slip.net_pay)}</span></div>
<p class="footer">
  ${footerNote ? `${footerNote}<br/>` : ''}
  Generated ${new Date().toLocaleString('en-PH')}
</p>
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
  onCreate: (data: { period_start: string; period_end: string; templateId?: string }) => Promise<void>
  templates: PayslipTemplate[]
}) {
  const today = new Date()
  const day = today.getDate()
  const defaultStart = day <= 15
    ? `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
    : `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-16`
  const defaultEnd = day <= 15
    ? `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-15`
    : new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().split('T')[0]

  const [form, setForm] = useState({ period_start: defaultStart, period_end: defaultEnd })
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!form.period_start || !form.period_end) return
    setLoading(true)
    await onCreate({ ...form, templateId: templateId || undefined })
    setLoading(false)
  }

  const selectedTpl = templates.find(t => t.id === templateId)

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

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Draft payslips will be auto-generated from time logs for all active employees in this date range.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Generate Payslips
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
  onClose,
  onSave,
}: {
  date: string
  employees: Employee[]
  onClose: () => void
  onSave: (log: { employee_id: string; clock_in: string; clock_out: string }) => Promise<void>
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [clockIn, setClockIn] = useState('08:00')
  const [clockOut, setClockOut] = useState('17:00')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!employeeId) { toast.error('Please select an employee'); return }
    if (!clockIn) { toast.error('Please set a clock-in time'); return }

    // Build ISO strings for the selected date
    const clockInISO = `${date}T${clockIn}:00`
    const clockOutISO = clockOut ? `${date}T${clockOut}:00` : ''

    setSaving(true)
    await onSave({ employee_id: employeeId, clock_in: clockInISO, clock_out: clockOutISO })
    setSaving(false)
  }

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', {
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
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !employeeId || !clockIn}
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
  onClose,
  onAddLog,
  onRefresh,
}: {
  date: string
  logs: TimeLog[]
  employees: Employee[]
  onClose: () => void
  onAddLog: (log: { employee_id: string; clock_in: string; clock_out: string }) => Promise<void>
  onRefresh: () => void
}) {
  const [showAddModal, setShowAddModal] = useState(false)

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const handleSave = async (log: { employee_id: string; clock_in: string; clock_out: string }) => {
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
                <div key={log.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{log.employees?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{log.employees?.role ?? ''}{log.employees?.employee_no ? ` · #${log.employees.employee_no}` : ''}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.clock_out ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {log.clock_out ? 'Completed' : 'Still clocked in'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-gray-400">Clock In</p>
                      <p className="text-sm font-medium text-gray-700">{fmtTime(log.clock_in)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Clock Out</p>
                      <p className="text-sm font-medium text-gray-700">{log.clock_out ? fmtTime(log.clock_out) : '—'}</p>
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
          onClose={() => setShowAddModal(false)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

// ─── Attendance Calendar Tab ──────────────────────────────────────────────────

function AttendanceTab() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [logsByDate, setLogsByDate] = useState<Record<string, TimeLog[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Fetch employees once for the Add Log modal
  useEffect(() => {
    fetch('/api/employees')
      .then(r => safeJson(r))
      .then(data => {
        if (data.employees) setEmployees(data.employees)
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

  const handleAddLog = async (log: { employee_id: string; clock_in: string; clock_out: string }) => {
    try {
      const body: Record<string, any> = {
        action: 'manual',
        employee_id: log.employee_id,
        clock_in: log.clock_in,
      }
      if (log.clock_out) {
        body.clock_out = log.clock_out
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
  const todayStr = today.toISOString().split('T')[0]

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
          onClose={() => setSelectedDate(null)}
          onAddLog={handleAddLog}
          onRefresh={fetchMonthLogs}
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
    if (!raw) return { late_deduction_per_minute: 0, sss_rate: 4.5, philhealth_rate: 2.5, pagibig_flat: 100, overtime_multiplier: 1.25, tax_rate: 0 }
    return { late_deduction_per_minute: 0, sss_rate: 4.5, philhealth_rate: 2.5, pagibig_flat: 100, overtime_multiplier: 1.25, tax_rate: 0, ...JSON.parse(raw) }
  } catch { return { late_deduction_per_minute: 0, sss_rate: 4.5, philhealth_rate: 2.5, pagibig_flat: 100, overtime_multiplier: 1.25, tax_rate: 0 } }
}

function savePayrollSettings(s: PayrollSettings) {
  try { localStorage.setItem(PAYROLL_SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

function SettingsTab() {
  const [settings, setSettings] = useState<PayrollSettings>(() =>
    typeof window !== 'undefined' ? loadPayrollSettings() : { late_deduction_per_minute: 0, sss_rate: 4.5, philhealth_rate: 2.5, pagibig_flat: 100, overtime_multiplier: 1.25, tax_rate: 0 }
  )
  const [saving, setSaving] = useState(false)

  // ── Other deductions (free-form, stored in localStorage) ──
  const [others, setOthers] = useState<OtherDeduction[]>(() =>
    typeof window !== 'undefined' ? loadOtherDeductions() : []
  )

  const handleSave = () => {
    setSaving(true)
    savePayrollSettings(settings)
    setTimeout(() => {
      setSaving(false)
      toast.success('Payroll settings saved')
    }, 300)
  }

  const addOther = () => {
    const next = [...others, { id: Date.now().toString(), label: '', amount: 0 }]
    setOthers(next)
    saveOtherDeductions(next)
  }

  const updateOther = (id: string, patch: Partial<OtherDeduction>) => {
    const next = others.map(o => o.id === id ? { ...o, ...patch } : o)
    setOthers(next)
    saveOtherDeductions(next)
  }

  const removeOther = (id: string) => {
    const next = others.filter(o => o.id !== id)
    setOthers(next)
    saveOtherDeductions(next)
  }

  const Field = ({ label, field, unit, description }: { label: string; field: keyof PayrollSettings; unit: string; description?: string }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" step="0.01" min="0"
          value={settings[field]}
          onChange={e => setSettings(s => ({ ...s, [field]: parseFloat(e.target.value) || 0 }))}
          className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
        />
        <span className="text-xs text-gray-400 w-12">{unit}</span>
      </div>
    </div>
  )

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
        <Field label="Late Deduction" field="late_deduction_per_minute" unit="₱ / min" description="Amount deducted per minute of tardiness" />
        <Field label="SSS Contribution" field="sss_rate" unit="% of basic" description="Employee share, semi-monthly" />
        <Field label="PhilHealth Contribution" field="philhealth_rate" unit="% of basic" description="Employee share, semi-monthly" />
        <Field label="Pag-IBIG Contribution" field="pagibig_flat" unit="₱ / month" description="Flat monthly amount (split semi-monthly)" />
        <Field label="Withholding Tax" field="tax_rate" unit="% of gross" description="Set to 0 to skip; override per payslip if needed" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-2">Earnings</p>
        <Field label="Overtime Multiplier" field="overtime_multiplier" unit="× rate" description="e.g. 1.25 = 125% of hourly rate for OT hours" />
      </div>

      {/* ── Others: free-form extra deductions ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 mb-4">
        <div className="flex items-center justify-between pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Others</p>
          <button
            onClick={addOther}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        </div>

        {others.length === 0 ? (
          <p className="text-xs text-gray-400 pb-4">
            No extra deductions yet.{' '}
            <button onClick={addOther} className="underline text-indigo-500 hover:text-indigo-700">Add one</button>
            {' '}to create a custom deduction that appears on every payslip.
          </p>
        ) : (
          <div className="space-y-2 pb-4">
            {others.map(o => (
              <div key={o.id} className="flex items-center gap-2">
                {/* Editable label */}
                <input
                  type="text"
                  value={o.label}
                  onChange={e => updateOther(o.id, { label: e.target.value })}
                  placeholder="Deduction name…"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {/* Amount */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={o.amount}
                    onChange={e => updateOther(o.id, { amount: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
                  />
                </div>
                {/* Remove */}
                <button
                  onClick={() => removeOther(o.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">
              These amounts are deducted from every employee's net pay when payslips are generated.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">These are defaults only. You can still override individual payslip amounts after generating.</p>


    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'payroll' | 'attendance' | 'templates' | 'settings'


export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<Tab>('payroll')
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null)
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [loadingPayslips, setLoadingPayslips] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [templates, setTemplates] = useState<PayslipTemplate[]>([])

  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true)
    try {
      const res = await fetch('/api/payroll')
      const data = await safeJson(res)
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
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(data.payslips ?? [])
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payslips')
    } finally {
      setLoadingPayslips(false)
    }
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])
  useEffect(() => { setTemplates(loadTemplates()) }, [])
  useEffect(() => {
    if (selectedPeriod) fetchPayslips(selectedPeriod.id)
    else setPayslips([])
  }, [selectedPeriod, fetchPayslips])

  const handleCreatePeriod = async (formData: { period_start: string; period_end: string; templateId?: string }) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_period', period_start: formData.period_start, period_end: formData.period_end }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      // Store the template association locally
      if (formData.templateId && data.period?.id) {
        savePeriodTemplate(data.period.id, formData.templateId)
      }
      toast.success(`Payroll period created with ${data.payslips?.length ?? 0} payslips`)
      setShowCreateModal(false)
      await fetchPeriods()
      if (data.period) setSelectedPeriod(data.period)
    } catch (e: any) { toast.error(e.message ?? 'Failed to create period') }
  }

  const handleUpdatePayslip = async (payslip_id: string, updates: Partial<Payslip>) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payslip', payslip_id, updates }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      setPayslips(prev => prev.map(s => s.id === payslip_id ? { ...s, ...data.payslip } : s))
      fetchPeriods()
    } catch (e: any) { toast.error(e.message ?? 'Failed to update payslip') }
  }

  const handleVoidPayslip = async (payslip_id: string) => {
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void_payslip', payslip_id }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      toast.success('Payslip voided and financial entries removed')
      setPayslips(prev => prev.filter(s => s.id !== payslip_id))
      fetchPeriods()
    } catch (e: any) { toast.error(e.message ?? 'Failed to void payslip') }
  }

  const handleFinalize = async () => {
    if (!selectedPeriod) return
    if (!confirm('Finalize this payroll period? All payslips will be locked.')) return
    setFinalizing(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize_period', period_id: selectedPeriod.id }),
      })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      toast.success('Payroll period finalized')
      setSelectedPeriod({ ...selectedPeriod, status: 'finalized' })
      await fetchPeriods(); await fetchPayslips(selectedPeriod.id)
    } catch (e: any) { toast.error(e.message ?? 'Failed to finalize') }
    finally { setFinalizing(false) }
  }

  const handleDelete = async () => {
    if (!selectedPeriod) return
    if (!confirm('Delete this draft payroll period? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/payroll?period_id=${selectedPeriod.id}`, { method: 'DELETE' })
      const data = await safeJson(res)
      if (data.error) throw new Error(data.error)
      toast.success('Period deleted'); setSelectedPeriod(null); await fetchPeriods()
    } catch (e: any) { toast.error(e.message ?? 'Failed to delete') }
    finally { setDeleting(false) }
  }

  const totalGross = payslips.reduce((s, p) => s + p.basic_pay + p.overtime_pay + p.allowance, 0)
  const totalDeductions = payslips.reduce((s, p) => s + p.late_deduction + p.sss_contribution + p.philhealth_contribution + p.pagibig_contribution + p.tax_withheld, 0)
  const totalNet = payslips.reduce((s, p) => s + p.net_pay, 0)

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'payroll', label: 'Payroll', icon: Calendar },
    { id: 'attendance', label: 'Attendance', icon: CalendarDays },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex items-center gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'attendance' && <div className="flex-1 overflow-y-auto"><AttendanceTab /></div>}
      {activeTab === 'templates' && <div className="flex-1 overflow-y-auto"><TemplatesTab /></div>}
      {activeTab === 'settings' && <div className="flex-1 overflow-y-auto"><SettingsTab /></div>}

      {activeTab === 'payroll' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Payroll Periods</h2>
                <p className="text-xs text-gray-400 mt-0.5">{periods.length} period{periods.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {loadingPeriods ? (
                <div className="flex items-center justify-center h-24 text-gray-400"><RefreshCw className="w-4 h-4 animate-spin" /></div>
              ) : periods.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No payroll periods yet.<br />Click + New to get started.
                </div>
              ) : periods.map(period => (
                <button key={period.id} onClick={() => setSelectedPeriod(period)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${selectedPeriod?.id === period.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{`${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}`}</p>
                    <Badge status={period.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Users className="w-3 h-3" />{period.payslip_count}</span>
                    <span className="text-xs font-medium text-gray-700">{fmt(period.total_net_pay)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {!selectedPeriod ? (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">Select a payroll period</p>
                  <p className="text-sm text-gray-400 mt-1">Or create a new one to get started</p>
                  <button onClick={() => setShowCreateModal(true)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
                    <Plus className="w-4 h-4" /> Create Payroll Period
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border-b border-gray-200 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="text-lg font-semibold text-gray-900">{`${fmtDate(selectedPeriod.period_start)} – ${fmtDate(selectedPeriod.period_end)}`}</h1>
                        <Badge status={selectedPeriod.status} />
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />{fmtDate(selectedPeriod.period_start)} – {fmtDate(selectedPeriod.period_end)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {payslips.length > 0 && (
                        <button
                          onClick={() => exportPayslipsCSV(payslips, selectedPeriod)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <FileDown className="w-3.5 h-3.5" /> Export CSV
                        </button>
                      )}
                      <Link href={`/hr/payroll/${selectedPeriod.id}/payslip`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                        <Printer className="w-3.5 h-3.5" /> View Payslips
                      </Link>
                      {selectedPeriod.status === 'draft' && (
                        <>
                          <button onClick={handleDelete} disabled={deleting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                          <button onClick={handleFinalize} disabled={finalizing || payslips.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                            {finalizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Finalize Payroll
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
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingPayslips ? (
                    <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading payslips…</div>
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
                        <PayslipRow key={slip.id} slip={slip} onUpdate={handleUpdatePayslip}
                          onPrint={s => printPayslip(s, selectedPeriod, getTemplateForPeriod(selectedPeriod.id))}
                          onVoid={handleVoidPayslip} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {showCreateModal && (
        <CreatePeriodModal onClose={() => setShowCreateModal(false)} onCreate={handleCreatePeriod} templates={templates} />
      )}
    </div>
  )
}
