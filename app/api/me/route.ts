// /app/api/me/route.ts
// Returns the current user's name + granted permission names
// Used by the staff dashboard to show only permitted tiles

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Get employee record for permissions
    const { data: employee } = await admin
      .from('employees')
      .select('id')
      .eq('email', appUser.email)
      .single()

    let permissions: string[] = []

    if (employee?.id) {
      const { data: perms } = await admin
        .from('employee_permissions')
        .select('permissions(name)')
        .eq('employee_id', employee.id)

      permissions = (perms ?? [])
        .map((p: any) => p.permissions?.name)
        .filter(Boolean)
    }

    return NextResponse.json({
      name: appUser.name,
      permissions,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
