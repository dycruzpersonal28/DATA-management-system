'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Search, Pencil, X, AlertTriangle, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface TimeLog {
  id: string
  employee_id: string
  clock_in: string
  clock_out: string | null
  date: string
  total_hours: number | null
  overtime_hours: number
  late_minutes: number
  is_late: boolean
  notes: string | null
  employees: { id: string; name: string; role: string; employee_no: string | null }
  shift_schedules: { id: string; name: string; start_time: string; end_time: string } | null
  approver: { id: string; name: string } | null
}

interface Employee {
  id: string
  name: string
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'

function fmtDateTime(iso: string) {
  try { return format(parseISO(iso), 'MMM d, yyyy h:mm a') } catch { return iso }
}
function fmtTime(iso: string) {
  try { return format(parseISO(iso), 'h:mm a') } catch { return iso }
}

export default function AttendancePage() {
  const [logs, setLogs]           = useState<TimeLog[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [editing, setEditing]     = useState<TimeLog | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [adjForm, setAdjForm]     = useState({
    clock_in: '', clock_out: '', late_minutes: 0, is_late: false, overtime_hours: 0, notes: ''
  })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (filterEmp) params.set('employee_id', filterEmp)
      const res = await fetch(`/api/time-logs?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLogs(data.logs ?? [])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, filterEmp])

  const fetchEmployees = useCallback(async () => {
    const res = await fetch('/api/employees')
    const data = await res.json()
    if (res.ok) setEmployees(data.employees ?? [])
  }, [])

  useEffect(() => { fetchLogs(); fetchEmployees() }, [fetchLogs, fetchEmployees])

  const filtered = logs.filter(l =>
    l.employees?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const openEdit = (log: TimeLog) => {
    setEditing(log)
    setAdjForm({
      clock_in:       log.clock_in ? format(parseISO(log.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      clock_out:      log.clock_out ? format(parseISO(log.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      late_minutes:   log.late_minutes ?? 0,
      is_late:        log.is_late ?? false,
      overtime_hours: log.overtime_hours ?? 0,
      notes:          log.notes ?? '',
    })
  }

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/time-logs', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id: editing.id,
          clock_in:       adjForm.clock_in ? new Date(adjForm.clock_in).toISOString() : undefined,
          clock_out:      adjForm.clock_out ? new Date(adjForm.clock_out).toISOString() : null,
          late_minutes:   adjForm.late_minutes,
          is_late:        adjForm.is_late,
          overtime_hours: adjForm.overtime_hours,
          notes:          adjForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Time log updated')
      setEditing(null)
      fetchLogs()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Summary stats
  const totalHours   = filtered.reduce((s, l) => s + (l.total_hours ?? 0), 0)
  const lateCount    = filtered.filter(l => l.is_late).length
  const openCount    = filtered.filter(l => !l.clock_out).length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor and adjust employee time logs</p>
        </div>
        <a
          href="/hr/kiosk"
          target="_blank"
          className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Clock className="w-4 h-4" />
          Open Kiosk
        </a>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Hours', value: totalHours.toFixed(1) + 'h' },
          { label: 'Late Entries', value: lateCount, warn: lateCount > 0 },
          { label: 'Currently Clocked In', value: openCount },
        ].map(s => (
          <div key={s.label} className={`bg-white border rounded-xl px-5 py-4 ${s.warn ? 'border-amber-200' : 'border-gray-200'}`}>
            <div className={`text-2xl font-semibold ${s.warn ? 'text-amber-600' : 'text-gray-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..." className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-12">Loading attendance...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">No time logs found for the selected period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Shift</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Clock In</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Clock Out</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Approved By</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{log.employees?.name}</div>
                    {log.employees?.employee_no && <div className="text-xs text-gray-400">{log.employees.employee_no}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.date}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{log.shift_schedules?.name ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtTime(log.clock_in)}</td>
                  <td className="px-4 py-3 text-gray-600">{log.clock_out ? fmtTime(log.clock_out) : <span className="text-amber-500 text-xs font-medium">Active</span>}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.total_hours != null ? `${log.total_hours.toFixed(2)}h` : '—'}
                    {log.overtime_hours > 0 && <span className="ml-1 text-xs text-blue-500">+{log.overtime_hours}h OT</span>}
                  </td>
                  <td className="px-4 py-3">
                    {log.is_late ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                        <AlertTriangle className="w-3 h-3" />
                        Late {log.late_minutes}m
                      </span>
                    ) : (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">On time</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {log.approver?.name ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(log)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Adjust Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Adjust Time Log</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editing.employees?.name} · {editing.date}</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clock In</label>
                  <input type="datetime-local" value={adjForm.clock_in} onChange={e => setAdjForm(f => ({ ...f, clock_in: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clock Out</label>
                  <input type="datetime-local" value={adjForm.clock_out} onChange={e => setAdjForm(f => ({ ...f, clock_out: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Late (minutes)</label>
                  <input type="number" min="0" value={adjForm.late_minutes} onChange={e => setAdjForm(f => ({ ...f, late_minutes: parseInt(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Overtime (hours)</label>
                  <input type="number" min="0" step="0.25" value={adjForm.overtime_hours} onChange={e => setAdjForm(f => ({ ...f, overtime_hours: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={adjForm.is_late} onChange={e => setAdjForm(f => ({ ...f, is_late: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm text-gray-700">Mark as late</span>
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Reason for adjustment..." className={inputCls + ' resize-none'} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
