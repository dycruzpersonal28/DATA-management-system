'use client'

// /app/(hr)/hr/payroll/[period_id]/payslip/page.tsx
// Full payslip viewer: on-screen preview, layout customizer, print all/single, CSV export

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Printer, Download, ArrowLeft, Settings2, Eye, EyeOff,
  RefreshCw, ChevronDown, ChevronUp, Users, X, Sliders,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Shop {
  name: string
  logo_url: string | null
  receipt_header: string | null
  receipt_footer: string | null
  currency_symbol: string
}

interface Employee {
  id: string
  name: string
  email: string
  employee_no: string | null
  employment_type: string | null
  role: string
  sss_no: string | null
  philhealth_no: string | null
  pagibig_no: string | null
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
  // Attendance snapshot — frozen at generation time
  total_hours: number
  overtime_hours: number
  late_minutes: number
  // Employee info snapshot — frozen at generation time
  snapshot_name: string | null
  snapshot_employee_no: string | null
  snapshot_role: string | null
  snapshot_employment_type: string | null
  snapshot_sss_no: string | null
  snapshot_philhealth_no: string | null
  snapshot_pagibig_no: string | null
  // Live join — used as fallback if snapshot fields are null (older payslips)
  employees: Employee
}

interface PayrollPeriod {
  id: string
  period_start: string
  period_end: string
  cutoff: string | null
  status: 'draft' | 'finalized'
}

interface TimeSummary {
  total_hours: number
  overtime_hours: number
  late_minutes: number
}

// Layout customizer settings
interface LayoutSettings {
  showLogo: boolean
  showEmployeeNo: boolean
  showGovNumbers: boolean
  showAttendance: boolean
  showEarnings: boolean
  showDeductions: boolean
  showSignature: boolean
  accentColor: string
  fontSize: 'sm' | 'md' | 'lg'
  paperSize: 'a4' | 'half'
}

const DEFAULT_LAYOUT: LayoutSettings = {
  showLogo: true,
  showEmployeeNo: true,
  showGovNumbers: true,
  showAttendance: true,
  showEarnings: true,
  showDeductions: true,
  showSignature: true,
  accentColor: '#111827',
  fontSize: 'md',
  paperSize: 'a4',
}

const ACCENT_COLORS = [
  { label: 'Charcoal', value: '#111827' },
  { label: 'Navy', value: '#1e3a5f' },
  { label: 'Forest', value: '#14532d' },
  { label: 'Burgundy', value: '#7f1d1d' },
  { label: 'Slate', value: '#334155' },
  { label: 'Indigo', value: '#3730a3' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string) => {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

const fmtCurrency = (n: number, symbol = '₱') =>
  `${symbol}${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2 }).format(n)}`

const fmtHours = (h: number) => `${h.toFixed(2)} hrs`
const fmtMins = (m: number) => `${m} min`

function periodLabel(p: PayrollPeriod) {
  return `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}`
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(payslips: Payslip[], period: PayrollPeriod) {
  const headers = [
    'Employee', 'Employee No', 'Role', 'Employment Type',
    'Total Hours', 'Overtime Hours', 'Late (min)',
    'Basic Pay', 'Overtime Pay', 'Allowance', 'Gross Pay',
    'Late Deduction', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Tax Withheld', 'Total Deductions',
    'Net Pay', 'Status',
  ]

  const rows = payslips.map(s => {
    const ts: TimeSummary = {
      total_hours:    s.total_hours    ?? 0,
      overtime_hours: s.overtime_hours ?? 0,
      late_minutes:   s.late_minutes   ?? 0,
    }
    const gross = s.basic_pay + s.overtime_pay + s.allowance
    const deductions = s.late_deduction + s.sss_contribution + s.philhealth_contribution + s.pagibig_contribution + s.tax_withheld
    return [
      s.employees.name,
      s.employees.employee_no ?? '',
      s.employees.role,
      s.employees.employment_type ?? '',
      ts.total_hours.toFixed(2),
      ts.overtime_hours.toFixed(2),
      ts.late_minutes,
      s.basic_pay.toFixed(2),
      s.overtime_pay.toFixed(2),
      s.allowance.toFixed(2),
      gross.toFixed(2),
      s.late_deduction.toFixed(2),
      s.sss_contribution.toFixed(2),
      s.philhealth_contribution.toFixed(2),
      s.pagibig_contribution.toFixed(2),
      s.tax_withheld.toFixed(2),
      deductions.toFixed(2),
      s.net_pay.toFixed(2),
      s.status,
    ]
  })

  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payroll_${period.period_start}_${period.period_end}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Print ────────────────────────────────────────────────────────────────────

function buildPrintHTML(
  payslips: Payslip[],
  period: PayrollPeriod,
  shop: Shop,
  layout: LayoutSettings,
) {
  const fs = layout.fontSize === 'sm' ? '11px' : layout.fontSize === 'lg' ? '14px' : '12px'
  const accent = layout.accentColor
  const pageStyle = layout.paperSize === 'half'
    ? 'max-width:148mm; margin:0 auto;'
    : 'max-width:210mm; margin:0 auto;'

  const slipHTML = payslips.map(slip => {
    const ts: TimeSummary = {
      total_hours:    slip.total_hours    ?? 0,
      overtime_hours: slip.overtime_hours ?? 0,
      late_minutes:   slip.late_minutes   ?? 0,
    }
    const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
    const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld
    const sym = shop.currency_symbol || '₱'
    // Snapshot fields with live fallback for older payslips
    const empName    = slip.snapshot_name            ?? slip.employees?.name
    const empNo      = slip.snapshot_employee_no     ?? slip.employees?.employee_no
    const empRole    = slip.snapshot_role            ?? slip.employees?.role
    const empType    = slip.snapshot_employment_type ?? slip.employees?.employment_type
    const empSss     = slip.snapshot_sss_no          ?? slip.employees?.sss_no
    const empPh      = slip.snapshot_philhealth_no   ?? slip.employees?.philhealth_no
    const empPagibig = slip.snapshot_pagibig_no      ?? slip.employees?.pagibig_no

    return `
    <div class="payslip">
      <!-- Header -->
      <div class="header">
        ${layout.showLogo && shop.logo_url ? `<img src="${shop.logo_url}" class="logo" alt="logo" />` : ''}
        <div class="shop-info">
          <h1>${shop.name}</h1>
          ${shop.receipt_header ? `<p class="subtext">${shop.receipt_header}</p>` : ''}
        </div>
        <div class="period-badge">
          <p class="label">Pay Period</p>
          <p class="value">${periodLabel(period)}</p>
          <p class="label" style="margin-top:4px">Status</p>
          <p class="value ${slip.status}">${slip.status.toUpperCase()}</p>
        </div>
      </div>

      <!-- Employee -->
      <div class="section employee-section">
        <div class="emp-name">${empName}</div>
        <div class="emp-meta">
          <span>${empRole}</span>
          ${empType ? `<span>· ${empType.replace('-', ' ')}</span>` : ''}
          ${layout.showEmployeeNo && empNo ? `<span>· #${empNo}</span>` : ''}
        </div>
        ${layout.showGovNumbers ? `
        <div class="gov-numbers">
          ${empSss ? `<span>SSS: ${empSss}</span>` : ''}
          ${empPh ? `<span>PhilHealth: ${empPh}</span>` : ''}
          ${empPagibig ? `<span>Pag-IBIG: ${empPagibig}</span>` : ''}
        </div>` : ''}
      </div>

      <div class="two-col">
        <!-- Left col -->
        <div>
          ${layout.showAttendance ? `
          <div class="section">
            <p class="section-title">Attendance</p>
            <div class="row"><span>Total Hours</span><span>${fmtHours(ts.total_hours)}</span></div>
            <div class="row"><span>Overtime Hours</span><span>${fmtHours(ts.overtime_hours)}</span></div>
            <div class="row"><span>Late</span><span>${fmtMins(ts.late_minutes)}</span></div>
          </div>` : ''}

          ${layout.showEarnings ? `
          <div class="section">
            <p class="section-title">Earnings</p>
            <div class="row"><span>Basic Pay</span><span>${fmtCurrency(slip.basic_pay, sym)}</span></div>
            ${slip.overtime_pay > 0 ? `<div class="row"><span>Overtime Pay</span><span>${fmtCurrency(slip.overtime_pay, sym)}</span></div>` : ''}
            ${slip.allowance > 0 ? `<div class="row"><span>Allowance</span><span>${fmtCurrency(slip.allowance, sym)}</span></div>` : ''}
            <div class="row total"><span>Gross Pay</span><span>${fmtCurrency(gross, sym)}</span></div>
          </div>` : ''}
        </div>

        <!-- Right col -->
        <div>
          ${layout.showDeductions ? `
          <div class="section">
            <p class="section-title">Deductions</p>
            ${slip.late_deduction > 0 ? `<div class="row"><span>Late Deduction</span><span>–${fmtCurrency(slip.late_deduction, sym)}</span></div>` : ''}
            <div class="row"><span>SSS</span><span>–${fmtCurrency(slip.sss_contribution, sym)}</span></div>
            <div class="row"><span>PhilHealth</span><span>–${fmtCurrency(slip.philhealth_contribution, sym)}</span></div>
            <div class="row"><span>Pag-IBIG</span><span>–${fmtCurrency(slip.pagibig_contribution, sym)}</span></div>
            ${slip.tax_withheld > 0 ? `<div class="row"><span>Withholding Tax</span><span>–${fmtCurrency(slip.tax_withheld, sym)}</span></div>` : ''}
            <div class="row total"><span>Total Deductions</span><span>–${fmtCurrency(deductions, sym)}</span></div>
          </div>` : ''}
        </div>
      </div>

      <!-- Net Pay -->
      <div class="net-pay-bar">
        <span>NET PAY</span>
        <span>${fmtCurrency(slip.net_pay, sym)}</span>
      </div>

      ${layout.showSignature ? `
      <div class="signatures">
        <div class="sig-line"><div class="line"></div><p>Employee Signature</p></div>
        <div class="sig-line"><div class="line"></div><p>Authorized by</p></div>
      </div>` : ''}

      ${shop.receipt_footer ? `<p class="footer-text">${shop.receipt_footer}</p>` : ''}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payslips — ${period.period_start}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: ${fs}; color: #111; background: #fff; }
    .payslip { ${pageStyle} padding: 24px 32px; margin-bottom: 0; page-break-after: always; border: 1px solid #e5e7eb; }
    .payslip:last-child { page-break-after: avoid; }

    /* Header */
    .header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid ${accent}; }
    .logo { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
    .shop-info { flex: 1; }
    .shop-info h1 { font-size: 18px; font-weight: 700; color: ${accent}; }
    .subtext { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .period-badge { text-align: right; flex-shrink: 0; }
    .period-badge .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; }
    .period-badge .value { font-size: 11px; font-weight: 600; color: #111; }
    .period-badge .value.finalized { color: #059669; }
    .period-badge .value.draft { color: #d97706; }

    /* Employee */
    .employee-section { margin-bottom: 16px; }
    .emp-name { font-size: 15px; font-weight: 700; color: ${accent}; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .emp-meta span { margin-right: 4px; }
    .gov-numbers { display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap; }
    .gov-numbers span { font-size: 10px; color: #9ca3af; }

    /* Sections */
    .section { margin-bottom: 14px; }
    .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid ${accent}20; }
    .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: ${fs}; border-bottom: 1px solid #f3f4f6; }
    .row.total { font-weight: 700; border-bottom: 1.5px solid #d1d5db; padding-top: 6px; margin-top: 3px; }

    /* Two col layout */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

    /* Net pay */
    .net-pay-bar { display: flex; justify-content: space-between; align-items: center; background: ${accent}; color: #fff; padding: 10px 16px; border-radius: 6px; margin: 16px 0; font-weight: 700; font-size: 15px; }

    /* Signatures */
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
    .sig-line { text-align: center; }
    .sig-line .line { border-top: 1px solid #374151; margin-bottom: 6px; }
    .sig-line p { font-size: 10px; color: #6b7280; }

    /* Footer */
    .footer-text { text-align: center; font-size: 10px; color: #9ca3af; margin-top: 16px; }

    @media print {
      body { background: white; }
      .payslip { border: none; padding: 16px 24px; }
    }
  </style>
</head>
<body>${slipHTML}</body>
</html>`
}

// ─── Payslip Card (on-screen preview) ────────────────────────────────────────

function PayslipCard({
  slip,
  shop,
  period,
  layout,
  onPrint,
}: {
  slip: Payslip
  shop: Shop
  period: PayrollPeriod
  layout: LayoutSettings
  onPrint: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const gross = slip.basic_pay + slip.overtime_pay + slip.allowance
  const deductions = slip.late_deduction + slip.sss_contribution + slip.philhealth_contribution + slip.pagibig_contribution + slip.tax_withheld
  const sym = shop.currency_symbol || '₱'
  const accent = layout.accentColor

  // Resolve snapshot fields — fall back to live join for older payslips
  const empName    = slip.snapshot_name            ?? slip.employees?.name
  const empNo      = slip.snapshot_employee_no     ?? slip.employees?.employee_no
  const empRole    = slip.snapshot_role            ?? slip.employees?.role
  const empType    = slip.snapshot_employment_type ?? slip.employees?.employment_type
  const empSss     = slip.snapshot_sss_no          ?? slip.employees?.sss_no
  const empPh      = slip.snapshot_philhealth_no   ?? slip.employees?.philhealth_no
  const empPagibig = slip.snapshot_pagibig_no      ?? slip.employees?.pagibig_no
  const timeSummary: TimeSummary = {
    total_hours:    slip.total_hours    ?? 0,
    overtime_hours: slip.overtime_hours ?? 0,
    late_minutes:   slip.late_minutes   ?? 0,
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Card header — always visible */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer"
        style={{ borderLeft: `4px solid ${accent}` }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{empName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {empRole}
            {empNo ? ` · #${empNo}` : ''}
            {empType ? ` · ${empType}` : ''}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-xs text-gray-400">Gross</p>
            <p className="font-medium text-gray-700">{fmtCurrency(gross, sym)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Deductions</p>
            <p className="font-medium text-red-500">–{fmtCurrency(deductions, sym)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Net Pay</p>
            <p className="font-bold text-gray-900 text-base">{fmtCurrency(slip.net_pay, sym)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slip.status === 'finalized' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {slip.status}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5">
          {/* Gov numbers */}
          {layout.showGovNumbers && (empSss || empPh || empPagibig) && (
            <div className="flex gap-6 mb-4 flex-wrap">
              {empSss && <span className="text-xs text-gray-400">SSS: <span className="text-gray-600 font-medium">{empSss}</span></span>}
              {empPh && <span className="text-xs text-gray-400">PhilHealth: <span className="text-gray-600 font-medium">{empPh}</span></span>}
              {empPagibig && <span className="text-xs text-gray-400">Pag-IBIG: <span className="text-gray-600 font-medium">{empPagibig}</span></span>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Attendance */}
            {layout.showAttendance && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>Attendance</p>
                <div className="space-y-1.5">
                  {[
                    ['Total Hours', fmtHours(timeSummary.total_hours)],
                    ['Overtime Hours', fmtHours(timeSummary.overtime_hours)],
                    ['Late', fmtMins(timeSummary.late_minutes)],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-800">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Earnings */}
            {layout.showEarnings && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>Earnings</p>
                <div className="space-y-1.5">
                  {[
                    ['Basic Pay', fmtCurrency(slip.basic_pay, sym)],
                    ['Overtime Pay', fmtCurrency(slip.overtime_pay, sym)],
                    ['Allowance', fmtCurrency(slip.allowance, sym)],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-800">{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-dashed border-gray-200">
                    <span>Gross Pay</span><span>{fmtCurrency(gross, sym)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Deductions */}
            {layout.showDeductions && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>Deductions</p>
                <div className="space-y-1.5">
                  {[
                    ['Late Deduction', fmtCurrency(slip.late_deduction, sym)],
                    ['SSS', fmtCurrency(slip.sss_contribution, sym)],
                    ['PhilHealth', fmtCurrency(slip.philhealth_contribution, sym)],
                    ['Pag-IBIG', fmtCurrency(slip.pagibig_contribution, sym)],
                    ['Withholding Tax', fmtCurrency(slip.tax_withheld, sym)],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-red-500">–{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-dashed border-gray-200">
                    <span>Total Deductions</span>
                    <span className="text-red-600">–{fmtCurrency(deductions, sym)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Net pay + print */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Net Pay</span>
              <span className="text-xl font-bold" style={{ color: accent }}>{fmtCurrency(slip.net_pay, sym)}</span>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onPrint() }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print this payslip
            </button>
          </div>

          {/* Signature lines on-screen hint */}
          {layout.showSignature && (
            <div className="grid grid-cols-2 gap-12 mt-6 pt-4 border-t border-dashed border-gray-100">
              {['Employee Signature', 'Authorized by'].map(label => (
                <div key={label} className="text-center">
                  <div className="border-t border-gray-300 mb-1.5" />
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Layout Customizer Sidebar ────────────────────────────────────────────────

function LayoutCustomizer({
  layout,
  onChange,
  onClose,
}: {
  layout: LayoutSettings
  onChange: (l: LayoutSettings) => void
  onClose: () => void
}) {
  const toggle = (key: keyof LayoutSettings) =>
    onChange({ ...layout, [key]: !layout[key as keyof LayoutSettings] })

  const TOGGLES: { key: keyof LayoutSettings; label: string }[] = [
    { key: 'showLogo', label: 'Show logo' },
    { key: 'showEmployeeNo', label: 'Employee number' },
    { key: 'showGovNumbers', label: "Gov't numbers (SSS / PhilHealth / Pag-IBIG)" },
    { key: 'showAttendance', label: 'Attendance summary' },
    { key: 'showEarnings', label: 'Earnings breakdown' },
    { key: 'showDeductions', label: 'Deductions breakdown' },
    { key: 'showSignature', label: 'Signature lines' },
  ]

  return (
    <aside className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Layout Settings</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="px-5 py-4 space-y-6">
        {/* Sections */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Sections</p>
          <div className="space-y-3">
            {TOGGLES.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">{label}</span>
                <button
                  onClick={() => toggle(key)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${layout[key] ? 'bg-gray-900' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${layout[key] ? 'translate-x-4' : ''}`} />
                </button>
              </label>
            ))}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Accent Color</p>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_COLORS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => onChange({ ...layout, accentColor: value })}
                title={label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs transition-all ${layout.accentColor === value ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: value }} />
                <span className="truncate text-gray-600">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Print Font Size</p>
          <div className="flex gap-2">
            {(['sm', 'md', 'lg'] as const).map(s => (
              <button
                key={s}
                onClick={() => onChange({ ...layout, fontSize: s })}
                className={`flex-1 py-1.5 text-sm rounded-lg border transition-all ${layout.fontSize === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
              </button>
            ))}
          </div>
        </div>

        {/* Paper size */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Paper Size</p>
          <div className="flex gap-2">
            {[{ v: 'a4', l: 'A4' }, { v: 'half', l: 'Half (A5)' }].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => onChange({ ...layout, paperSize: v as 'a4' | 'half' })}
                className={`flex-1 py-1.5 text-sm rounded-lg border transition-all ${layout.paperSize === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 mt-auto">
        <button
          onClick={() => onChange(DEFAULT_LAYOUT)}
          className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset to defaults
        </button>
      </div>
    </aside>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayslipPage() {
  const { period_id } = useParams<{ period_id: string }>()
  const router = useRouter()

  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [period, setPeriod] = useState<PayrollPeriod | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [layout, setLayout] = useState<LayoutSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('payslip_layout')
        if (saved) return { ...DEFAULT_LAYOUT, ...JSON.parse(saved) }
      } catch {}
    }
    return DEFAULT_LAYOUT
  })

  // Persist layout to localStorage
  useEffect(() => {
    try { localStorage.setItem('payslip_layout', JSON.stringify(layout)) } catch {}
  }, [layout])

  // ── Fetch everything ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Payslips + period
      const res = await fetch(`/api/payroll?period_id=${period_id}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPayslips(data.payslips ?? [])

      // Period info (fetch all periods, find ours)
      const pRes = await fetch('/api/payroll')
      const pData = await pRes.json()
      const found = (pData.periods ?? []).find((p: PayrollPeriod) => p.id === period_id)
      if (found) setPeriod(found)

      // Shop info
      const sRes = await fetch('/api/shop')
      const sData = await sRes.json()
      if (sData.shop) setShop(sData.shop)

      // Attendance data is now stored as snapshot columns on each payslip row
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load payslip data')
    } finally {
      setLoading(false)
    }
  }, [period_id])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Print all ───────────────────────────────────────────────────────────────
  const handlePrintAll = () => {
    if (!period || !shop) return
    const html = buildPrintHTML(payslips, period, shop, layout)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400) }
  }

  // ── Print single ────────────────────────────────────────────────────────────
  const handlePrintOne = (slip: Payslip) => {
    if (!period || !shop) return
    const html = buildPrintHTML([slip], period, shop, layout)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400) }
  }

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const handleCSV = () => {
    if (!period) return
    exportCSV(payslips, period)
    toast.success('CSV downloaded')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading payslips…
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">
              {period ? periodLabel(period) : 'Payslips'}
            </h1>
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
              <Users className="w-3 h-3" /> {payslips.length} employee{payslips.length !== 1 ? 's' : ''}
              {period && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${period.status === 'finalized' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {period.status}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCustomizer(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${showCustomizer ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Layout
            </button>
            <button
              onClick={handleCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handlePrintAll}
              disabled={payslips.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print All
            </button>
          </div>
        </div>

        {/* Payslip cards */}
        <div className="flex-1 overflow-y-auto p-6">
          {payslips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <Users className="w-10 h-10 mb-3 text-gray-300" />
              <p className="font-medium">No payslips in this period</p>
              <p className="text-sm mt-1">Go back and generate payslips first</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl">
              {shop && period && payslips.map(slip => (
                <PayslipCard
                  key={slip.id}
                  slip={slip}
                  shop={shop}
                  period={period}
                  layout={layout}
                  onPrint={() => handlePrintOne(slip)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Layout customizer sidebar ───────────────────────────────────────── */}
      {showCustomizer && (
        <LayoutCustomizer
          layout={layout}
          onChange={setLayout}
          onClose={() => setShowCustomizer(false)}
        />
      )}
    </div>
  )
}
