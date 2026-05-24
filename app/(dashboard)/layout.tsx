import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let { data: shop } = await supabase
    .from('shops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!shop) {
    const { data: newShop } = await supabase
      .from('shops')
      .insert({ owner_id: user.id, name: 'My Store' })
      .select()
      .single()
    shop = newShop
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar shop={shop} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
