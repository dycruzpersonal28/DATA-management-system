// /app/api/me/route.ts
// Returns the current user's name + granted permission names
// Used by the staff dashboard to show only permitted tiles

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Server-side cache ──────────────────────────────────────────────────────────
// Keyed by auth user id. Avoids repeat DB hits when multiple tabs or rapid
// navigations call /api/me within the same window.
const SERVER_CACHE_TTL_MS = 30_000 // 30 seconds

type CacheEntry = {
  data: { name: string; permissions: string[] }
  expires: number
}

const meCache = new Map<string, CacheEntry>()

// ── Route ──────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return from server cache if still fresh
    const cached = meCache.get(user.id)
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=30' },
      })
    }

    const admin = createAdminClient()

    // Get app_user for name + email
    const { data: appUser } = await admin
      .from('app_users')
      .select('name, email, role_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get employee record + permissions in parallel
    // (employees query needs email from appUser, but permissions needs employee.id,
    //  so we collapse the last two queries into one join instead)
    const { data: employee } = await admin
      .from('employees')
      .select('id, employee_permissions(permissions(name))')
      .eq('email', appUser.email)
      .single()

    const permissions: string[] = (employee?.employee_permissions ?? [])
      .map((p: any) => p.permissions?.name)
      .filter(Boolean)

    const responseData = { name: appUser.name, permissions }

    // Populate server cache
    meCache.set(user.id, { data: responseData, expires: Date.now() + SERVER_CACHE_TTL_MS })

    // Cache-Control tells the browser to reuse this response for 30s,
    // eliminating the request entirely on repeat navigations
    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
