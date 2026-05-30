import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Cache per user: { isFullAccess, allowed[], exp }
const userCache = new Map<string, { isFullAccess: boolean; allowed: string[]; exp: number }>()

// Route prefix → permission name required to access it
// ⚠️ HR routes are under /hr/ prefix — must match actual URL structure
const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/dashboard':     'page_dashboard',
  '/reports':       'page_reports',
  '/transactions':  'page_transactions',
  '/items':         'page_items',
  '/categories':    'page_categories',
  '/modifiers':     'page_modifiers',
  '/ingredients':   'page_ingredients',
  '/inventory':     'page_inventory',
  '/customers':     'page_customers',
  '/employees':     'page_employees',
  '/settings':      'page_settings',
  '/pos':           'page_pos',
  '/staff':         'page_staff_dashboard',
  // HR routes — files live under /hr/ prefix
  '/hr/shifts':     'page_shifts',
  '/hr/attendance': 'page_attendance',
  '/hr/kiosk':      'page_kiosk',
  '/hr/payroll':    'page_payroll',
}

// Role names that get full access regardless of permissions
// Matches against the `roles.name` value (case-insensitive)
const FULL_ACCESS_ROLES = ['owner', 'manager', 'admin']

// Redirect a restricted user to the best page they have access to
function getHomeForUser(allowed: string[]): string {
  if (allowed.includes('page_staff_dashboard')) return '/staff'
  if (allowed.includes('page_dashboard'))       return '/dashboard'
  if (allowed.includes('page_pos'))             return '/pos'
  // Fall back to the first matched route they can access
  const first = Object.entries(ROUTE_PERMISSION_MAP).find(([, perm]) => allowed.includes(perm))
  return first ? first[0] : '/staff'
}

// Helper: check must_change_password across employees + app_users
async function getMustChangePassword(adminClient: any, authUserId: string): Promise<boolean> {
  const { data: empRow } = await adminClient
    .from('employees')
    .select('must_change_password')
    .eq('auth_user_id', authUserId)
    .single()

  // Employee row found — use it
  if (empRow !== null) return empRow?.must_change_password === true

  // No employee row (owner/manager) — fall back to app_users
  const { data: appUserRow } = await adminClient
    .from('app_users')
    .select('must_change_password')
    .eq('auth_user_id', authUserId)
    .single()

  return appUserRow?.must_change_password === true
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()
  if (error || !data) {
    // Auth service is down — fail safe, let the request through or redirect
    return supabaseResponse
  }
  const { user } = data

  const pathname          = request.nextUrl.pathname
  const isAuthPage        = pathname === '/login' || pathname === '/pin'
  const isChangePassword  = pathname === '/change-password'

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    if (isAuthPage) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Must-change-password guard ────────────────────────────────────────────
  // Checks employees first, falls back to app_users for owner/manager accounts
  // that have no employee row.
  if (!isChangePassword && !isAuthPage) {
    const adminForFlag = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const mustChange = await getMustChangePassword(adminForFlag, user.id)
    if (mustChange) {
      const url = request.nextUrl.clone()
      url.pathname = '/change-password'
      return NextResponse.redirect(url)
    }
  }

  // ── If already on change-password, check flag to decide whether to let through
  if (isChangePassword) {
    const adminForFlag = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const mustChange = await getMustChangePassword(adminForFlag, user.id)
    if (!mustChange) {
      // Flag cleared — bounce to dashboard
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    // Flag still true → let them through to the change-password page
    return supabaseResponse
  }

  // ── Load role + permissions (cached 60s) ──────────────────────────────────
  let isFullAccess = false
  let allowed: string[] = []

  const cached = userCache.get(user.id)
  if (cached && cached.exp > Date.now()) {
    isFullAccess = cached.isFullAccess
    allowed      = cached.allowed
  } else {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Get email + role_id from app_users
    const { data: appUser } = await admin
      .from('app_users')
      .select('email, role_id')
      .eq('auth_user_id', user.id)
      .single()

    // 2. Look up the actual role name from the roles table
    let roleName: string | undefined
    if (appUser?.role_id) {
      const { data: roleRow } = await admin
        .from('roles')
        .select('name')
        .eq('id', appUser.role_id)
        .single()
      roleName = roleRow?.name
    }

    // 3. Check if this role gets full access
    isFullAccess = FULL_ACCESS_ROLES.includes(roleName?.toLowerCase() ?? '')

    if (!isFullAccess && appUser?.email) {
      // 4. Find employee by email and load their permissions
      const { data: employee } = await admin
        .from('employees')
        .select('id')
        .eq('email', appUser.email)
        .single()

      if (employee?.id) {
        const { data: perms } = await admin
          .from('employee_permissions')
          .select('permissions(name)')
          .eq('employee_id', employee.id)

        allowed = (perms ?? [])
          .map((p: any) => p.permissions?.name)
          .filter(Boolean)
      }
    }

    userCache.set(user.id, { isFullAccess, allowed, exp: Date.now() + 60_000 })
  }

  // ── Logged in + on auth page → redirect to correct home ──────────────────
  if (isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = isFullAccess ? '/dashboard' : getHomeForUser(allowed)
    return NextResponse.redirect(url)
  }

  // ── Full access roles → skip permission checks ────────────────────────────
  if (isFullAccess) return supabaseResponse

  // ── Check permission for current route ───────────────────────────────────
  const matchedRoute = Object.keys(ROUTE_PERMISSION_MAP).find(prefix =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (matchedRoute) {
    const requiredPerm = ROUTE_PERMISSION_MAP[matchedRoute]
    if (!allowed.includes(requiredPerm)) {
      const url = request.nextUrl.clone()
      url.pathname = getHomeForUser(allowed)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
