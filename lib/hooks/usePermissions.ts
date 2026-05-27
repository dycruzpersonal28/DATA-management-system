'use client'

/**
 * usePermissions
 * ──────────────
 * Defines role-based permissions for POS actions.
 * Roles: 'admin' | 'manager' | 'cashier' | 'staff'
 *
 * To configure per-shop, extend this to load from a `role_permissions` table.
 * For now, defaults are hardcoded and can be overridden in User Management settings.
 */

export type AppRole = 'admin' | 'manager' | 'cashier' | 'staff'

export type Permission =
  | 'void_transaction'
  | 'edit_transaction'
  | 'reprint_receipt'
  | 'view_sales_report'
  | 'apply_discount'
  | 'cash_in_out'
  | 'clock_out_others'

// Default permission matrix — managers and above can do sensitive actions
const DEFAULT_PERMISSIONS: Record<Permission, AppRole[]> = {
  void_transaction:  ['admin', 'manager'],
  edit_transaction:  ['admin', 'manager'],
  reprint_receipt:   ['admin', 'manager', 'cashier'],
  view_sales_report: ['admin', 'manager'],
  apply_discount:    ['admin', 'manager', 'cashier'],
  cash_in_out:       ['admin', 'manager', 'cashier'],
  clock_out_others:  ['admin', 'manager'],
}

export function hasPermission(role: AppRole | string | undefined, permission: Permission): boolean {
  if (!role) return false
  const allowed = DEFAULT_PERMISSIONS[permission] as string[]
  return allowed.includes(role)
}

/**
 * Permissions that require manager PIN approval even if the user has the role.
 * These actions always prompt for a manager PIN at the POS.
 */
export const REQUIRES_MANAGER_PIN: Permission[] = [
  'void_transaction',
  'edit_transaction',
]
