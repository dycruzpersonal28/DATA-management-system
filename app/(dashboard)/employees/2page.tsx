'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, Pencil, Trash2,
  UserCheck, UserX, X, Eye, EyeOff,
  ChevronDown, ChevronUp, Loader2, ShieldCheck,
  KeyRound, RotateCcw
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type EmploymentType = 'full-time' | 'part-time' | 'contractual'

interface Role {
  id: string
  name: string
  color: string
}

interface Permission {
  id: string
  name: string
  label: string
  category: string
  granted: boolean
}

interface Employee {
  id: string
  name: string
  email: string
  role: string
  role_id: string | null
  employee_no: string | null
  address: string | null
  mobile_number: string | null
  hourly_rate: number
  allowance: number
  employment_type: EmploymentType
  sss_no: string | null
  philhealth_no: string | null
  pagibig_no: string | null
  is_active: boolean
  is_kiosk_visible: boolean
  require_manager_approval: boolean
  govt_deductions_enabled: boolean
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// Nav-structured permission tree — matches sidebar order exactly
// Each nav item has a page permission + its action-level sub-permissions
const NAV_TREE = [
  {
    nav: 'POS',
    icon: '🖥️',
    items: [
      { name: 'page_pos',              label: 'Access POS' },
      { name: 'page_pos_shift_report', label: 'View Shift Report' },
      { name: 'pos_apply_discount',    label: 'Apply Discounts' },
      { name: 'pos_void_sale',         label: 'Void Sales' },
      { name: 'pos_refund',            label: 'Process Refunds' },
      { name: 'pos_open_drawer',       label: 'Open Cash Drawer' },
      { name: 'pos_override_price',    label: 'Override Item Price' },
    ],
  },
  {
    nav: 'Dashboard',
    icon: '📊',
    items: [
      { name: 'page_dashboard',    label: 'View Dashboard' },
    ],
  },
  {
    nav: 'Reports',
    icon: '📈',
    items: [
      { name: 'page_reports',      label: 'View Reports' },
    ],
  },
  {
    nav: 'Transactions',
    icon: '🔁',
    items: [
      { name: 'page_transactions', label: 'View Transactions' },
    ],
  },
  {
    nav: 'Items',
    icon: '📦',
    items: [
      { name: 'page_items',        label: 'View Items' },
      { name: 'page_categories',   label: 'View Categories' },
      { name: 'page_modifiers',    label: 'View Modifiers' },
      { name: 'page_ingredients',  label: 'View Ingredients' },
      { name: 'menu_edit',         label: 'Edit Menu Items' },
      { name: 'menu_delete',       label: 'Delete Menu Items' },
    ],
  },
  {
    nav: 'Inventory',
    icon: '🗃️',
    items: [
      { name: 'page_inventory',     label: 'View Inventory' },
      { name: 'page_inventory_log', label: 'View Inventory Log' },
      { name: 'inventory_adjust',   label: 'Adjust Stock Levels' },
    ],
  },
  {
    nav: 'Customers',
    icon: '👥',
    items: [
      { name: 'page_customers',    label: 'View Customers' },
      { name: 'customers_edit',    label: 'Edit Customers' },
      { name: 'customers_delete',  label: 'Delete Customers' },
    ],
  },
  {
    nav: 'HR',
    icon: '🧑‍💼',
    items: [
      { name: 'page_employees',    label: 'View Employees' },
      { name: 'hr_edit_employees', label: 'Edit Employees' },
      { name: 'page_shifts',       label: 'View Shifts' },
      { name: 'hr_manage_shifts',  label: 'Manage Shifts' },
      { name: 'page_attendance',   label: 'View Attendance' },
      { name: 'page_kiosk',        label: 'Access HR Kiosk' },
      { name: 'page_payroll',      label: 'View Payroll' },
      { name: 'hr_view_payroll',   label: 'View Payroll Info' },
    ],
  },
  {
    nav: 'Settings',
    icon: '⚙️',
    items: [
      { name: 'page_settings',        label: 'View Settings' },
      { name: 'settings_store',       label: 'Manage Store Settings' },
      { name: 'settings_features',    label: 'Manage Features' },
      { name: 'settings_payment',           label: 'Manage Payment Types' },
      { name: 'settings_conversion_presets', label: 'Manage Conversion Presets' },
      { name: 'settings_loyalty',           label: 'Manage Loyalty' },
      { name: 'settings_taxes',       label: 'Manage Taxes & Discounts' },
      { name: 'settings_receipt',     label: 'Manage Receipt' },
      { name: 'settings_printers',    label: 'Manage Kitchen Printers' },
      { name: 'settings_dining',      label: 'Manage Dining Options' },
      { name: 'settings_pos',         label: 'Manage POS Settings' },
      { name: 'settings_roles',       label: 'Manage Roles' },
      { name: 'settings_permissions', label: 'Manage Permissions' },
      { name: 'settings_kds',         label: 'Manage KDS Stations' },  
    ],
  },
  {
    nav: 'Staff Dashboard',
    icon: '📱',
    items: [
      { name: 'page_staff_dashboard',   label: 'Access Staff Dashboard' },
      { name: 'page_kitchen_printers',  label: 'Access Printer Setup' },
    ],
  },

  {
    nav: 'Kitchen Display',
    icon: '🍳',
    items: [
      { name: 'page_kds',      label: 'Access KDS' },
      { name: 'page_kds_logs', label: 'View KDS Logs' },
    ],
  },
]

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role_id: '',
  employee_no: '',
  address: '',
  mobile_number: '',
  pin: '',
  hourly_rate: '',
  allowance: '',
  sss_no: '',
  philhealth_no: '',
  pagibig_no: '',
  employment_type: 'full-time' as EmploymentType,
  is_kiosk_visible: false,
  require_manager_approval: true,
  govt_deductions_enabled: false,
}

// ─── Permissions Checklist (nav-structured) ───────────────────────────────────

function PermissionsChecklist({
  permissions,
  selected,
  onChange,
  loading,
}: {
  permissions: Permission[]
  selected: Set<string>
  onChange: (id: string, checked: boolean) => void
  loading: boolean
}) {
  const [openNavs, setOpenNavs] = useState<Record<string, boolean>>(
    Object.fromEntries(NAV_TREE.map(n => [n.nav, true]))
  )

  // Build a lookup: permission.name → permission
  const byName = Object.fromEntries(permissions.map(p => [p.name, p]))

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />Loading permissions…
      </div>
    )
  }

  if (permissions.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-2">
        No permissions found. Make sure the migration SQL has been run.
      </p>
    )
  }

  const toggleNav = (nav: string) =>
    setOpenNavs(prev => ({ ...prev, [nav]: !prev[nav] }))

  const navGrantedCount = (items: { name: string }[]) =>
    items.filter(i => {
      const p = byName[i.name]
      return p && selected.has(p.id)
    }).length

  const allInNav = (items: { name: string }[]) =>
    items.every(i => { const p = byName[i.name]; return p && selected.has(p.id) })

  const toggleAllInNav = (items: { name: string }[]) => {
    const all = allInNav(items)
    items.forEach(i => {
      const p = byName[i.name]
      if (p) onChange(p.id, !all)
    })
  }

  return (
    <div className="space-y-1.5">
      {NAV_TREE.map(({ nav, icon, items }) => {
        const count   = navGrantedCount(items)
        const total   = items.filter(i => byName[i.name]).length
        const isOpen  = openNavs[nav]
        const all     = allInNav(items)

        return (
          <div key={nav} className="border border-gray-100 rounded-xl overflow-hidden">
            {/* Nav header row */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              <button
                type="button"
                onClick={() => toggleNav(nav)}
                className="flex items-center gap-2 flex-1 text-left min-w-0"
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="text-sm font-semibold text-gray-700">{nav}</span>
                <span className="text-xs text-gray-400 ml-1">{count}/{total}</span>
                {isOpen
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                }
              </button>
              {total > 0 && (
                <button
                  type="button"
                  onClick={() => toggleAllInNav(items)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                >
                  {all ? 'None' : 'All'}
                </button>
              )}
            </div>

            {/* Permission rows */}
            {isOpen && (
              <div className="px-3 py-2 space-y-0">
                {items.map(item => {
                  const perm = byName[item.name]
                  if (!perm) return null
                  const checked = selected.has(perm.id)
                  return (
                    <label
                      key={perm.id}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors ${
                        checked ? 'bg-indigo-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => onChange(perm.id, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                      />
                      <span className={`text-sm transition-colors ${checked ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>
                        {item.label}
                      </span>
                    </label>
                  )
                })}
                {items.every(i => !byName[i.name]) && (
                  <p className="text-xs text-gray-400 px-2 py-1">No permissions seeded for this section.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const [employees, setEmployees]       = useState<Employee[]>([])
  const [roles, setRoles]               = useState<Role[]>([])
  const [permissions, setPermissions]   = useState<Permission[]>([])
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [permsLoading, setPermsLoading] = useState(false)

  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [showForm, setShowForm]         = useState(false)
  const [editing, setEditing]           = useState<Employee | null>(null)
  const [deleting, setDeleting]         = useState<Employee | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [showPass, setShowPass]         = useState(false)
  const [showHR, setShowHR]             = useState(false)
  const [showPerms, setShowPerms]       = useState(true)
  const [form, setForm] = useState<typeof EMPTY_FORM & { is_kiosk_visible: boolean; require_manager_approval: boolean }>(EMPTY_FORM)
  const [resetting, setResetting]       = useState<Employee | null>(null)
  const [resetForm, setResetForm]       = useState({ password: '', pin: '' })
  const [showResetPass, setShowResetPass] = useState(false)
  const [showPin, setShowPin]           = useState(false)
  const [showResetPin, setShowResetPin] = useState(false)

  // ── Fetch employees ──────────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load employees')
      setEmployees(data.employees ?? data ?? [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch roles + all permissions on mount ───────────────────────────────────
  useEffect(() => {
    fetchEmployees()

    // Roles
    fetch('/api/roles')
      .then(r => r.json())
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {})

    // All permissions (flat list)
    fetch('/api/permissions')
      .then(r => r.json())
      .then(data => {
        const flat = Array.isArray(data) ? data : (data.flat ?? [])
        setPermissions(flat)
      })
      .catch(() => {})
  }, [fetchEmployees])

  // ── Load employee permissions when opening edit ───────────────────────────────
  const loadEmployeePerms = useCallback(async (employeeId: string) => {
    setPermsLoading(true)
    try {
      const res = await fetch(`/api/employee-permissions?employee_id=${employeeId}`)
      const data = await res.json()
      const list: Permission[] = Array.isArray(data) ? data : (data.flat ?? [])
      const granted = new Set<string>(
        list.filter((p: Permission) => p.granted).map((p: Permission) => p.id)
      )
      setSelectedPerms(granted)
    } catch {
      toast.error('Failed to load permissions')
    } finally {
      setPermsLoading(false)
    }
  }, [])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = employees.filter(e =>
    [e.name, e.email, e.employee_no, e.role].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  )

  // ── Role lookup for table display ─────────────────────────────────────────────
  const roleMap = Object.fromEntries(roles.map(r => [r.id, r]))

  // ── Open create ───────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, role_id: roles[0]?.id ?? '' })
    setSelectedPerms(new Set())
    setShowHR(false)
    setShowPerms(true)
    setShowPass(false)
    setShowPin(false)
    setShowForm(true)
  }

  // ── Open edit ─────────────────────────────────────────────────────────────────
  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setForm({
      name:             emp.name,
      email:            emp.email,
      password:         '',
      role_id:          emp.role_id ?? '',
      employee_no:      emp.employee_no ?? '',
      address:          emp.address ?? '',
      mobile_number:    emp.mobile_number ?? '',
      pin:              '',
      hourly_rate:      emp.hourly_rate?.toString() ?? '',
      allowance:        emp.allowance?.toString() ?? '',
      sss_no:           emp.sss_no ?? '',
      philhealth_no:    emp.philhealth_no ?? '',
      pagibig_no:       emp.pagibig_no ?? '',
      employment_type:  emp.employment_type ?? 'full-time',
      is_kiosk_visible: emp.is_kiosk_visible ?? false,
      require_manager_approval: emp.require_manager_approval ?? true,
      govt_deductions_enabled: emp.govt_deductions_enabled ?? false,
    })
    setShowHR(true)
    setShowPerms(true)
    setShowPass(false)
    setShowPin(false)
    setShowForm(true)
    loadEmployeePerms(emp.id)
  }

  // ── Permission toggle ─────────────────────────────────────────────────────────
  const togglePerm = (id: string, checked: boolean) => {
    setSelectedPerms(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // 1. Save employee
      // For PATCH: strip password and pin (those go through reset flow only)
      // For POST:  include password + must_change_password flag
      const base = {
        ...form,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : 0,
        allowance:   form.allowance   ? parseFloat(form.allowance)   : 0,
      }

      let payload: Record<string, any>
      if (editing) {
        const { password, pin, ...rest } = base
        payload = { ...rest, id: editing.id }
      } else {
        payload = { ...base, must_change_password: true }
      }

      const res = await fetch('/api/employees', {
        method:  editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const employeeId = editing ? editing.id : data.employee?.id

      // 2. Save permissions if we have an employee ID
      if (employeeId) {
        const permRes = await fetch('/api/employee-permissions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            employee_id:    employeeId,
            permission_ids: Array.from(selectedPerms),
          }),
        })
        if (!permRes.ok) {
          const permData = await permRes.json()
          toast.error(`Saved employee but permissions failed: ${permData.error}`)
        }
      }

      toast.success(editing ? 'Employee updated' : 'Employee created successfully')
      setShowForm(false)
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees?id=${deleting.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Employee deleted')
      setDeleting(null)
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete employee')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  const toggleActive = async (emp: Employee) => {
    try {
      const res = await fetch('/api/employees', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: emp.id, is_active: !emp.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(emp.is_active ? 'Employee deactivated' : 'Employee activated')
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // ── Reset credentials ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!resetting) return
    if (!resetForm.password && !resetForm.pin) {
      toast.error('Enter a temporary password or PIN to reset')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/employees', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:                   resetting.id,
          ...(resetForm.password ? { password: resetForm.password } : {}),
          ...(resetForm.pin      ? { pin:      resetForm.pin }      : {}),
          must_change_password:  true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Credentials reset for ${resetting.name}. They will be prompted to set a new password on next login.`)
      setResetting(null)
      setResetForm({ password: '', pin: '' })
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset credentials')
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {employees.length} total · {employees.filter(e => e.is_active).length} active
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-4 h-4" />Add Employee
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, role..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading employees...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            {search ? 'No employees match your search.' : 'No employees yet. Add one to get started.'}
          </div>
        ) : (
          <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto' }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Emp. No.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(emp => {
                const roleObj = emp.role_id ? roleMap[emp.role_id] : null
                return (
                  <tr key={emp.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      <div className="font-medium text-gray-900">{emp.name}</div>
                      <div className="text-gray-400 text-xs">{emp.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {roleObj ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: roleObj.color }}
                        >
                          {roleObj.name}
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 capitalize">
                          {emp.role ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {emp.employee_no || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize hidden md:table-cell">
                      {emp.employment_type?.replace('-', ' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleActive(emp)}
                          title={emp.is_active ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {emp.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setResetting(emp)
                            setResetForm({ password: '', pin: '' })
                            setShowResetPass(false)
                            setShowResetPin(false)
                          }}
                          title="Reset Password / PIN"
                          className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(emp)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleting(emp)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">

              {/* ── Basic Info ── */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Basic Info</h3>

                <Field label="Full Name">
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Juan dela Cruz"
                    className={inputCls}
                  />
                </Field>

                <Field label="Email Address *">
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="employee@example.com"
                    className={inputCls}
                    disabled={!!editing}
                  />
                  {editing && <p className="text-xs text-gray-400 mt-1">Email cannot be changed after creation</p>}
                </Field>

                {!editing && (
                  <Field label="Password *">
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required={!editing}
                        minLength={6}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Min. 6 characters"
                        className={inputCls + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </Field>
                )}

                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setResetting(editing)
                      setResetForm({ password: '', pin: '' })
                      setShowResetPass(false)
                      setShowResetPin(false)
                    }}
                    className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    <KeyRound className="w-4 h-4" />
                    Reset Password / PIN
                  </button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Role dropdown — dynamic from roles table */}
                  <Field label="Role *">
                    {roles.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…
                      </div>
                    ) : (
                      <select
                        required
                        value={form.role_id}
                        onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="" disabled>Select a role</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field label="PIN">
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={form.pin}
                        onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        placeholder="e.g. 123456"
                        className={inputCls + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </Field>
                </div>

                {/* Kiosk visibility toggle */}
                <label className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Show on clock-in kiosk</p>
                    <p className="text-xs text-gray-400 mt-0.5">Employee will appear on the HR kiosk grid</p>
                  </div>
                  <div
                    onClick={() => setForm(f => ({ ...f, is_kiosk_visible: !f.is_kiosk_visible }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                      form.is_kiosk_visible ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      form.is_kiosk_visible ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                </label>

                {/* Manager approval toggle */}
                <label className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Require manager approval</p>
                    <p className="text-xs text-gray-400 mt-0.5">Manager PIN required to approve clock-in/out on kiosk</p>
                  </div>
                  <div
                    onClick={() => setForm(f => ({ ...f, require_manager_approval: !f.require_manager_approval }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                      form.require_manager_approval ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      form.require_manager_approval ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                </label>
              </section>

              {/* ── Permissions ── */}
              <section className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPerms(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider w-full"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Permissions
                  <span className="ml-1 font-normal normal-case text-gray-400">
                    ({selectedPerms.size} granted)
                  </span>
                  {showPerms
                    ? <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                    : <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                  }
                </button>

                {showPerms && (
                  <PermissionsChecklist
                    permissions={permissions}
                    selected={selectedPerms}
                    onChange={togglePerm}
                    loading={permsLoading}
                  />
                )}
              </section>

              {/* ── HR Details (collapsible) ── */}
              <section>
                <button
                  type="button"
                  onClick={() => setShowHR(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider w-full"
                >
                  HR & Payroll Details
                  {showHR ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showHR && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Employee No.">
                        <input
                          value={form.employee_no}
                          onChange={e => setForm(f => ({ ...f, employee_no: e.target.value }))}
                          placeholder="e.g. EMP-001"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Employment Type">
                        <select
                          value={form.employment_type}
                          onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}
                          className={inputCls}
                        >
                          <option value="full-time">Full-time</option>
                          <option value="part-time">Part-time</option>
                          <option value="contractual">Contractual</option>
                        </select>
                      </Field>
                    </div>

                    <Field label="Mobile Number">
                      <input
                        value={form.mobile_number}
                        onChange={e => setForm(f => ({ ...f, mobile_number: e.target.value }))}
                        placeholder="e.g. 09XX XXX XXXX"
                        className={inputCls}
                      />
                    </Field>

                    <Field label="Address">
                      <textarea
                        value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Complete address"
                        rows={2}
                        className={inputCls + ' resize-none'}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Hourly Rate (₱)">
                        <input
                          type="number" min="0" step="0.01"
                          value={form.hourly_rate}
                          onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                          placeholder="0.00"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Allowance (₱)">
                        <input
                          type="number" min="0" step="0.01"
                          value={form.allowance}
                          onChange={e => setForm(f => ({ ...f, allowance: e.target.value }))}
                          placeholder="0.00"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Field label="SSS No.">
                        <input
                          value={form.sss_no}
                          onChange={e => setForm(f => ({ ...f, sss_no: e.target.value }))}
                          placeholder="XX-XXXXXXX-X"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="PhilHealth No.">
                        <input
                          value={form.philhealth_no}
                          onChange={e => setForm(f => ({ ...f, philhealth_no: e.target.value }))}
                          placeholder="XXXX-XXXXXXX-X"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Pag-IBIG No.">
                        <input
                          value={form.pagibig_no}
                          onChange={e => setForm(f => ({ ...f, pagibig_no: e.target.value }))}
                          placeholder="XXXX-XXXX-XXXX"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    {/* Govt deductions toggle */}
                    <label className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Enable govt. contributions</p>
                        <p className="text-xs text-gray-400 mt-0.5">Auto-compute SSS, PhilHealth, and Pag-IBIG when generating payslips</p>
                      </div>
                      <div
                        onClick={() => setForm(f => ({ ...f, govt_deductions_enabled: !f.govt_deductions_enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                          form.govt_deductions_enabled ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          form.govt_deductions_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </div>
                    </label>
                  </div>
                )}
              </section>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? (editing ? 'Saving...' : 'Creating...')
                    : (editing ? 'Save Changes' : 'Create Employee')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Credentials Modal ── */}
      {resetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-50 rounded-lg">
                <RotateCcw className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Reset Credentials</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Set a temporary password or PIN for <strong>{resetting.name}</strong>. They will be required to create a new password on their next login.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Temporary Password</label>
                <div className="relative">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    value={resetForm.password}
                    onChange={e => setResetForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters"
                    minLength={6}
                    className={inputCls + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Temporary PIN</label>
                <div className="relative">
                  <input
                    type={showResetPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={resetForm.pin}
                    onChange={e => setResetForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    placeholder="e.g. 123456"
                    className={inputCls + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPin(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showResetPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                The employee will be prompted to change their password on next login.
              </p>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setResetting(null); setResetForm({ password: '', pin: '' }); setShowResetPin(false) }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Resetting...' : 'Reset Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete Employee</h2>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure you want to delete <strong>{deleting.name}</strong>? This will remove their login access and all associated records. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
