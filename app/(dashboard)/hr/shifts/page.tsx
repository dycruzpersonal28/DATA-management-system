'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, Moon } from 'lucide-react'

interface ShiftSchedule {
  id: string
  name: string
  start_time: string
  end_time: string
  is_overnight: boolean
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = { name: '', start_time: '08:00', end_time: '17:00', is_overnight: false }

function fmt12(time24: string) {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function ShiftsPage() {
  const [shifts, setShifts]       = useState<ShiftSchedule[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<ShiftSchedule | null>(null)
  const [deleting, setDeleting]   = useState<ShiftSchedule | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shifts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShifts(data.shifts ?? [])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (shift: ShiftSchedule) => {
    setEditing(shift)
    setForm({
      name:         shift.name,
      start_time:   shift.start_time.slice(0, 5),
      end_time:     shift.end_time.slice(0, 5),
      is_overnight: shift.is_overnight,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/shifts', {
        method:  editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editing ? { id: editing.id, ...form } : form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(editing ? 'Shift updated' : 'Shift created')
      setShowForm(false)
      fetchShifts()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/shifts?id=${deleting.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Shift deleted')
      setDeleting(null)
      fetchShifts()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (shift: ShiftSchedule) => {
    try {
      const res = await fetch('/api/shifts', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: shift.id, is_active: !shift.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      fetchShifts()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Shift Schedules</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shifts.length} shifts configured</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Shift
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-12">Loading shifts...</div>
      ) : shifts.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12 border border-dashed border-gray-200 rounded-xl">
          No shifts yet. Create your first shift schedule.
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map(shift => (
            <div
              key={shift.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{shift.name}</span>
                    {shift.is_overnight && (
                      <span className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                        <Moon className="w-3 h-3" /> Overnight
                      </span>
                    )}
                    {!shift.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {fmt12(shift.start_time.slice(0, 5))} — {fmt12(shift.end_time.slice(0, 5))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleActive(shift)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  {shift.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => openEdit(shift)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleting(shift)}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Shift' : 'New Shift Schedule'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shift Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning Shift, Night Shift"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_overnight}
                  onChange={e => setForm(f => ({ ...f, is_overnight: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Overnight shift (ends next day)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Delete Shift</h2>
            <p className="text-sm text-gray-500 mb-5">
              Delete <strong>{deleting.name}</strong>? Existing time logs using this shift will not be affected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={submitting} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
