'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, KeyRound, Loader2, X, Check, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Permission {
  id: string
  name: string
  label: string
  group_name: string
  sort_order: number
  created_at: string
}

// ─── Group badge colours ───────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  Pages:    'bg-blue-50 text-blue-700 border-blue-200',
  HR:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  Settings: 'bg-violet-50 text-violet-700 border-violet-200',
  Features: 'bg-amber-50 text-amber-700 border-amber-200',
  General:  'bg-gray-100 text-gray-600 border-gray-200',
}

function groupBadge(group: string) {
  return GROUP_COLORS[group] ?? GROUP_COLORS.General
}

// ─── Permission Form Modal ─────────────────────────────────────────────────────

const GROUPS = ['Pages', 'HR', 'Settings', 'Features', 'General']

function PermissionModal({
  permission,
  onClose,
  onSaved,
}: {
  permission?: Permission
  onClose: () => void
  onSaved: (p: Permission) => void
}) {
  const isEdit = !!permission
  const [name,       setName]       = useState(permission?.name ?? '')
  const [label,      setLabel]      = useState(permission?.label ?? '')
  const [groupName,  setGroupName]  = useState(permission?.group_name ?? 'General')
  const [sortOrder,  setSortOrder]  = useState(permission?.sort_order ?? 99)
  const [saving,     setSaving]     = useState(false)

  async function handleSubmit() {
    if (!label.trim()) { toast.error('Label is required'); return }
    if (!isEdit && !name.trim()) { toast.error('Name (key) is required'); return }
    setSaving(true)
    try {
      const body = isEdit
        ? { id: permission!.id, label, group_name: groupName, sort_order: sortOrder }
        : { name, label, group_name: groupName, sort_order: sortOrder }

      const res = await fetch('/api/permissions', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return }
      toast.success(isEdit ? 'Permission updated' : 'Permission created')
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
            {isEdit ? 'Edit Permission' : 'New Permission'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Key / name — immutable on edit */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Key <span className="text-gray-400 font-normal">(internal identifier)</span>
            </label>
            {isEdit ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="font-mono text-xs text-gray-500">{permission!.name}</span>
                <span className="ml-auto text-xs text-gray-400 italic">read-only</span>
              </div>
            ) : (
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="e.g. feat_export_data"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
              />
            )}
            {!isEdit && (
              <p className="text-xs text-gray-400">Snake_case. Cannot be changed after creation.</p>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Display Label</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Export Data"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          {/* Group */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Group</label>
            <div className="flex flex-wrap gap-2">
              {GROUPS.map(g => (
                <button
                  key={g}
                  onClick={() => setGroupName(g)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    groupName === g
                      ? groupBadge(g) + ' ring-2 ring-offset-1 ring-indigo-400'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Sort order */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(Number(e.target.value))}
              className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400">Lower numbers appear first within the group.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !label.trim() || (!isEdit && !name.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : <><Check className="w-3.5 h-3.5" />{isEdit ? 'Save Changes' : 'Create'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  permission,
  onClose,
  onDeleted,
}: {
  permission: Permission
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleting,  setDeleting]  = useState(false)
  const [confirmed, setConfirmed] = useState(false) // set after warning 409
  const [warnCount, setWarnCount] = useState<number | null>(null)

  async function handleDelete(force = false) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/permissions?id=${permission.id}${force ? '&force=true' : ''}`, { method: 'DELETE' })
      const data = await res.json()

      if (res.status === 409 && data.warning) {
        // Show warning, ask for confirmation
        setWarnCount(data.count)
        setConfirmed(true)
        setDeleting(false)
        return
      }
      if (!res.ok) { toast.error(data.error ?? 'Failed to delete'); return }
      toast.success(`"${permission.label}" deleted`)
      onDeleted(permission.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-5 space-y-3">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', confirmed ? 'bg-orange-100' : 'bg-red-100')}>
            {confirmed
              ? <AlertTriangle className="w-5 h-5 text-orange-600" />
              : <Trash2 className="w-5 h-5 text-red-600" />
            }
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {confirmed ? 'Are you sure?' : `Delete "${permission.label}"?`}
          </h2>
          <p className="text-sm text-gray-500">
            {confirmed
              ? `This permission is currently assigned to ${warnCount} employee(s). Deleting it will remove it from all of them.`
              : 'This action cannot be undone. Any employees with this permission assigned will lose it.'
            }
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => handleDelete(confirmed)}
            disabled={deleting}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50',
              confirmed ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'
            )}
          >
            {deleting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting…</>
              : confirmed
                ? <><AlertTriangle className="w-3.5 h-3.5" />Delete Anyway</>
                : <><Trash2 className="w-3.5 h-3.5" />Delete</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Group Section ─────────────────────────────────────────────────────────────

function GroupSection({
  group,
  permissions,
  onEdit,
  onDelete,
}: {
  group: string
  permissions: Permission[]
  onEdit: (p: Permission) => void
  onDelete: (p: Permission) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Group header */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-semibold border', groupBadge(group))}>
            {group}
          </span>
          <span className="text-xs text-gray-400">{permissions.length} permission{permissions.length !== 1 ? 's' : ''}</span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
      </button>

      {open && (
        <table className="w-full text-sm border-t border-gray-100">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Label</th>
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Key</th>
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Order</th>
              <th className="px-5 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {permissions.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-5 py-3 font-medium text-gray-800">{p.label}</td>
                <td className="px-5 py-3">
                  <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{p.name}</span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{p.sort_order}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(p)}
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
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const [permissions, setPermissions]   = useState<Permission[]>([])
  const [loading, setLoading]           = useState(true)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editPerm, setEditPerm]         = useState<Permission | undefined>()
  const [deletePerm, setDeletePerm]     = useState<Permission | undefined>()

  useEffect(() => {
    fetch('/api/permissions')
      .then(r => r.json())
      .then(data => {
        setPermissions(Array.isArray(data.flat) ? data.flat : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Group + sort client-side
  const grouped = useMemo(() => {
    const map: Record<string, Permission[]> = {}
    for (const p of permissions) {
      if (!map[p.group_name]) map[p.group_name] = []
      map[p.group_name].push(p)
    }
    // Sort each group by sort_order
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => a.sort_order - b.sort_order)
    }
    // Return in preferred group order
    const ORDER = ['Pages', 'HR', 'Settings', 'Features', 'General']
    const sorted: [string, Permission[]][] = []
    for (const g of ORDER) {
      if (map[g]) sorted.push([g, map[g]])
    }
    // Any custom groups not in the preferred order
    for (const g of Object.keys(map)) {
      if (!ORDER.includes(g)) sorted.push([g, map[g]])
    }
    return sorted
  }, [permissions])

  function openCreate() { setEditPerm(undefined); setModalOpen(true) }
  function openEdit(p: Permission) { setEditPerm(p); setModalOpen(true) }

  function handleSaved(saved: Permission) {
    setPermissions(prev => {
      const exists = prev.find(p => p.id === saved.id)
      return exists
        ? prev.map(p => p.id === saved.id ? saved : p)
        : [...prev, saved]
    })
    setModalOpen(false)
  }

  function handleDeleted(id: string) {
    setPermissions(prev => prev.filter(p => p.id !== id))
    setDeletePerm(undefined)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Permissions</h1>
            <p className="text-sm text-gray-500">Define what employees can access and do</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />New Permission
        </button>
      </div>

      {/* Stats strip */}
      {!loading && permissions.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {grouped.map(([group, perms]) => (
            <div key={group} className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border', groupBadge(group))}>
              {group} <span className="opacity-60">·</span> {perms.length}
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading permissions…
        </div>
      ) : permissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2 bg-white rounded-2xl border border-gray-200">
          <KeyRound className="w-8 h-8 text-gray-300" />
          <p className="text-sm">No permissions yet — create your first one</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([group, perms]) => (
            <GroupSection
              key={group}
              group={group}
              permissions={perms}
              onEdit={openEdit}
              onDelete={setDeletePerm}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 px-1">
        Permission keys are immutable after creation. Add new permissions here as your app grows; assign them to employees on the Employees page.
      </p>

      {/* Modals */}
      {modalOpen && (
        <PermissionModal
          permission={editPerm}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {deletePerm && (
        <DeleteModal
          permission={deletePerm}
          onClose={() => setDeletePerm(undefined)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
