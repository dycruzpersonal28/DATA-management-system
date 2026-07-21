import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    redirect('/login')
  }

  // 2. Look up app_users using admin client (bypasses RLS)
  const admin = createAdminClient()

  const { data: appUser } = await admin
    .from('app_users')
    .select('id, name, email, role, shop_id, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!appUser) {
    redirect('/login')
  }

 
  // 5. Fetch shop
  const { data: shop } = await admin
    .from('shops')
    .select('*')
    .eq('id', appUser.shop_id)
    .single()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        shop={shop}
        userName={appUser.name}
        userRole={appUser.role}
      />
      {/* pt-14 on mobile gives room for the hamburger button; removed on lg+ */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
