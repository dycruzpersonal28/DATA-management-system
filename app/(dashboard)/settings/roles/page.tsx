'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ShieldCheck, Loader2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string
  name: string
  color: string
  created_at: string
}

// ─── Colour presets (matches your seed data + extras) ─────────────────────────

const COLOR_PRESETS = [
  { label: 'Violet',  value: '#7c3aed' },
  { label: 'Blue',    value: '#2563eb' },
  { label: 'Cyan',    value: '#0891b2' },
  { label: 'Green',   value: '#059669' },
  { label: 'Amber',   value: '#d97706' },
  { label: 'Rose',    value: '#e11d48' },
  { label: 'Pink',    value: '#db2777' },
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Slate',   value: '#475569' },
  { label: 'Orange',  value: '#ea580c' },
]

// ─── Role Form Modal ───────────────────────────────────────────────────────────

function RoleModal({
  role,
  onClose,
  onSaved,
}: {
  role?: Role
  onClose: () => void
  onSaved: (role: Role) => void
}) {
  const isEdit = !!role
  const [name, setName]     = useState(role?.name ?? '')
  const [color, setColor]   = useState(role?.color ?? '#6366f1')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/roles', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: role!.id, name, color } : { name, color }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return }
      toast.success(isEdit ? 'Role updated' : 'Role created')
      onSaved(data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Role' : 'New Role'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Role Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Supervisor"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Badge Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setColor(preset.value)}
                  title={preset.label}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all border-2',
                    color === preset.value
                      ? 'border-gray-900 scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: preset.value }}
                />
              ))}
            </div>

            {/* Custom hex input */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: color }} />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="#6366f1"
                className="w-32 px-2 py-1 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-400">custom hex</span>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Preview</label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {name || 'Role name'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : <><Check className="w-3.5 h-3.5" />{isEdit ? 'Save Changes' : 'Create Role'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  role,
  onClose,
  onDeleted,
}: {
  role: Role
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to delete'); return }
      toast.success(`"${role.name}" deleted`)
      onDeleted(role.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-5 space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">Delete "{role.name}"?</h2>
          <p className="text-sm text-gray-500">
            This action cannot be undone. Roles with employees assigned cannot be deleted.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {deleting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting…</>
              : <><Trash2 className="w-3.5 h-3.5" />Delete</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [roles, setRoles]           = useState<Role[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editRole, setEditRole]     = useState<Role | undefined>()
  const [deleteRole, setDeleteRole] = useState<Role | undefined>()

  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.json())
      .then(data => { setRoles(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function openCreate() { setEditRole(undefined); setModalOpen(true) }
  function openEdit(r: Role) { setEditRole(r); setModalOpen(true) }

  function handleSaved(saved: Role) {
    setRoles(prev => {
      const exists = prev.find(r => r.id === saved.id)
      return exists
        ? prev.map(r => r.id === saved.id ? saved : r)
        : [...prev, saved]
    })
    setModalOpen(false)
  }

  function handleDeleted(id: string) {
    setRoles(prev => prev.filter(r => r.id !== id))
    setDeleteRole(undefined)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Roles</h1>
            <p className="text-sm text-gray-500">Manage employee roles and badge colors</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />New Role
        </button>
      </div>

      {/* Roles list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading roles…
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-2">
            <ShieldCheck className="w-8 h-8 text-gray-300" />
            <p className="text-sm">No roles yet — create your first one</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roles.map(role => (
                <tr key={role.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: role.color }}
                    >
                      {role.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: role.color }} />
                      <span className="font-mono text-xs text-gray-500">{role.color}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {new Date(role.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(role)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteRole(role)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info callout */}
      <p className="text-xs text-gray-400 px-1">
        Roles with employees assigned cannot be deleted. To remove a role, first reassign its employees.
      </p>

      {/* Modals */}
      {modalOpen && (
        <RoleModal
          role={editRole}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {deleteRole && (
        <DeleteModal
          role={deleteRole}
          onClose={() => setDeleteRole(undefined)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
