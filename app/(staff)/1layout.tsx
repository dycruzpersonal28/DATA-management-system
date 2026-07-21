import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      {children}
    </div>
  )
}
