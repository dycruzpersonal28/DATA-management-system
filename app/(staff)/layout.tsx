import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PermissionsProvider } from '@/lib/permissions/context'

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: appUser } = await admin
    .from('app_users')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!appUser) redirect('/login')

  // employee_permissions only stores permission_id + granted; the actual
  // permission name lives on the related permissions table.
  const { data: permsData, error: permsError } = await admin
    .from('employee_permissions')
    .select('granted, permissions(name)')
    .eq('employee_id', appUser.id)
    .eq('granted', true)

  if (permsError) {
    console.error('Failed to load employee permissions:', permsError)
  }

  const permissions = (permsData || [])
    .map((p: any) => p.permissions?.name)
    .filter(Boolean)

  return (
    <PermissionsProvider permissions={permissions}>
      <div className="h-screen bg-gray-50 overflow-hidden">
        {children}
      </div>
    </PermissionsProvider>
  )
}
