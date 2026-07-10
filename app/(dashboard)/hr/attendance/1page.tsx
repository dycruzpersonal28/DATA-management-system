'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Search, Pencil, X, AlertTriangle, Clock } from 'lucide-react'
// date-fns removed — all date/time formatting uses Intl with shop timezone

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
  break_minutes: number
  log_type: string
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

function fmtTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
  } catch { return iso }
}

function fmtBreak(minutes: number) {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function AttendancePage() {
  const [logs, setLogs]           = useState<TimeLog[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')
  const [search, setSearch]       = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [dateFrom, setDateFrom]   = useState(() => {
    // Use Intl with UTC as a safe initial — will be recalculated once shopTimezone loads
    const now = new Date()
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d)
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return fmt(firstOfMonth)
  })
  const [dateTo, setDateTo] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date())
  )
  const [editing, setEditing]       = useState<TimeLog | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [adjForm, setAdjForm]       = useState({
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
      setLogs((data.logs ?? []).filter((l: TimeLog) => l.log_type === 'work'))
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

  // Fetch shop timezone on mount, then recalculate the default date range in that timezone
  useEffect(() => {
    fetch('/api/shop-settings')
      .then(r => r.json())
      .then(data => {
        const tz = data?.timezone || 'Asia/Manila'
        setShopTimezone(tz)
        const now = new Date()
        const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
        const todayStr = fmt(now)
        // First of the current month in shop timezone
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit',
        }).formatToParts(now)
        const y = parts.find(p => p.type === 'year')?.value ?? String(now.getFullYear())
        const m = parts.find(p => p.type === 'month')?.value ?? '01'
        setDateFrom(`${y}-${m}-01`)
        setDateTo(todayStr)
      })
      .catch(() => {
        // fallback: keep defaults already set
      })
  }, [])



  useEffect(() => { fetchLogs(); fetchEmployees() }, [fetchLogs, fetchEmployees])
  const filtered = logs.filter(l =>
    l.employees?.name?.toLowerCase().includes(search.toLowerCase())
  )

  // Format an ISO string into "yyyy-MM-ddTHH:mm" in the shop's timezone
  // so datetime-local inputs pre-fill with the correct local time
  function toLocalInput(iso: string, tz: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date(iso))
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
      const hh = get('hour') === '24' ? '00' : get('hour') // midnight edge case
      return `${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}`
    } catch { return '' }
  }

  // Convert a datetime-local string (no tz info) entered in shop timezone → UTC ISO
  function fromLocalInput(localStr: string, tz: string): string {
    // localStr is "yyyy-MM-ddTHH:mm". We need to find what UTC moment that is in `tz`.
    // Strategy: parse as if UTC, measure the offset at that moment, then shift.
    const naiveMs = new Date(localStr + 'Z').getTime()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date(naiveMs))
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    const localIso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
    const localMs = new Date(localIso + 'Z').getTime()
    return new Date(naiveMs - (localMs - naiveMs)).toISOString()
  }

  const openEdit = (log: TimeLog) => {
    setEditing(log)
    setAdjForm({
      clock_in:       log.clock_in  ? toLocalInput(log.clock_in,  shopTimezone) : '',
      clock_out:      log.clock_out ? toLocalInput(log.clock_out, shopTimezone) : '',
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
          clock_in:       adjForm.clock_in  ? fromLocalInput(adjForm.clock_in,  shopTimezone) : undefined,
          clock_out:      adjForm.clock_out ? fromLocalInput(adjForm.clock_out, shopTimezone) : null,
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

  const totalHours = filtered.reduce((s, l) => s + (l.total_hours ?? 0), 0)
  const lateCount  = filtered.filter(l => l.is_late).length
  const openCount  = filtered.filter(l => !l.clock_out).length

  return (
    <div className="flex flex-col h-screen p-6 max-w-6xl mx-auto">
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
      <div className="grid grid-cols-3 gap-4 mb-6 flex-shrink-0">
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
      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
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

      {/* Table — scrollable body, frozen header */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-12">Loading attendance...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">No time logs found for the selected period.</div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Shift</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Clock In</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Clock Out</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Break</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Approved By</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(log => {
                  const breakFmt = fmtBreak(log.break_minutes)
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{log.employees?.name}</div>
                        {log.employees?.employee_no && <div className="text-xs text-gray-400">{log.employees.employee_no}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.date}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{log.shift_schedules?.name ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtTime(log.clock_in, shopTimezone)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.clock_out ? fmtTime(log.clock_out, shopTimezone) : <span className="text-amber-500 text-xs font-medium">Active</span>}
                      </td>
                      <td className="px-4 py-3">
                        {breakFmt ? (
                          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                            {breakFmt}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.total_hours != null ? (
                          <div>
                            <span>{log.total_hours.toFixed(2)}h</span>
                            {log.break_minutes > 0 && (
                              <div className="text-xs text-gray-400">
                                gross {((log.total_hours) + log.break_minutes / 60).toFixed(2)}h
                              </div>
                            )}
                            {log.overtime_hours > 0 && (
                              <span className="ml-1 text-xs text-blue-500">+{log.overtime_hours}h OT</span>
                            )}
                          </div>
                        ) : '—'}
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
                  )
                })}
              </tbody>
            </table>
          </div>
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
