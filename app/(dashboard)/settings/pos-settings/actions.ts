'use server'

import { createClient } from '@supabase/supabase-js'

// Service-role client — server only, never exposed to the browser
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function createAppUser({
  shopId, name, email, password, role,
}: {
  shopId: string
  name: string
  email: string
  password: string
  role: string
}) {
  // 1. Create Supabase Auth account
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, shop_id: shopId },
  })

  if (authError) return { error: authError.message }

  // 2. Create app_users record (login identity)
  const { data: appUser, error: dbError } = await supabaseAdmin
    .from('app_users')
    .insert({
      shop_id: shopId,
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      is_active: true,
    })
    .select()
    .single()

  if (dbError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { error: dbError.message }
  }

  // 3. Auto-create linked employees record (operational profile)
  const { error: empError } = await supabaseAdmin
    .from('employees')
    .insert({
      shop_id: shopId,
      app_user_id: appUser.id,
      name,
      email,
      role,
      is_active: true,
      can_apply_discounts: role === 'manager' || role === 'owner',
      can_void_sales: role === 'manager' || role === 'owner',
      can_view_reports: role === 'manager' || role === 'owner',
      can_manage_inventory: role === 'owner',
    })

  if (empError) {
    // Non-fatal — app_user was created successfully, just log the employee creation failure
    console.error('[createAppUser] Failed to create employee record:', empError.message)
  }

  return { data: appUser }
}

// ── Update name / role, and optionally reset password ──────────────────────────
export async function updateAppUser({
  appUserId,
  authUserId,
  name,
  role,
  password,
}: {
  appUserId: string
  authUserId: string | null
  name: string
  role: string
  password?: string
}) {
  // Update app_users
  const { error: dbError } = await supabaseAdmin
    .from('app_users')
    .update({ name, role })
    .eq('id', appUserId)

  if (dbError) return { error: dbError.message }

  // Keep employees record in sync
  await supabaseAdmin
    .from('employees')
    .update({ name, role })
    .eq('app_user_id', appUserId)

  // Optionally reset password
  if (password && authUserId) {
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password,
      user_metadata: { name, role },
    })
    if (pwError) return { error: pwError.message }
  }

  return { data: { id: appUserId, name, role } }
}

// ── Delete from Auth, app_users, and employees ─────────────────────────────────
export async function deleteAppUser({
  appUserId,
  authUserId,
}: {
  appUserId: string
  authUserId: string | null
}) {
  // Delete employee record first (foreign key)
  await supabaseAdmin
    .from('employees')
    .delete()
    .eq('app_user_id', appUserId)

  // Delete app_users record
  const { error: dbError } = await supabaseAdmin
    .from('app_users')
    .delete()
    .eq('id', appUserId)

  if (dbError) return { error: dbError.message }

  // Delete auth account
  if (authUserId) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId)
  }

  return { data: { deleted: appUserId } }
}

// ── One-time: link your existing Supabase owner account to app_users ───────────
export async function bootstrapOwner({
  authUserId,
  shopId,
  name,
  email,
}: {
  authUserId: string
  shopId: string
  name: string
  email: string
}) {
  const { data: existing } = await supabaseAdmin
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single()

  if (existing) return { data: existing, alreadyExists: true }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .insert({
      shop_id: shopId,
      auth_user_id: authUserId,
      name,
      email,
      role: 'owner',
      is_active: true,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}
