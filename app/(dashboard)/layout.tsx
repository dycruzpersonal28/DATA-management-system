import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // 1. Check session
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user) {
    console.log('[layout] No user session:', userError?.message)
    redirect('/login')
  }

  console.log('[layout] Auth user id:', user.id)

  // 2. Look up app_users
  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('id, name, email, role, shop_id, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  console.log('[layout] appUser:', appUser, 'error:', appUserError?.message)

  if (!appUser) {
    console.log('[layout] No app_user found — signing out')
    await supabase.auth.signOut()
    redirect('/login')
  }

  // 3. Fetch shop
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('*')
    .eq('id', appUser.shop_id)
    .single()

  console.log('[layout] shop:', shop?.name, 'error:', shopError?.message)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        shop={shop}
        userName={appUser.name}
        userRole={appUser.role}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
