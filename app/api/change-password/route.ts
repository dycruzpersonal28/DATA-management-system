import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// POST /api/change-password
// Body: { password: string, pin?: string }
// Called by the user themselves on first login — clears must_change_password flag
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { password, pin } = await req.json()

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Update Supabase Auth password
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(user.id, { password })
    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 400 })
    }

    // 2. Clear must_change_password on app_users
    await admin
      .from('app_users')
      .update({ must_change_password: false })
      .eq('auth_user_id', user.id)

    // 3. Clear must_change_password on employees + optionally update PIN
    const updates: Record<string, any> = { must_change_password: false }
    if (pin) updates.pin = String(pin).trim()

    await admin
      .from('employees')
      .update(updates)
      .eq('auth_user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
