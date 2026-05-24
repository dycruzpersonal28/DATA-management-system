import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { ShoppingCart, Users, Package, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('*')
    .single()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayReceipts } = await supabase
    .from('receipts')
    .select('total')
    .eq('status', 'completed')
    .gte('created_at', today.toISOString())

  const todaySales = todayReceipts?.reduce((s, r) => s + r.total, 0) ?? 0
  const todayCount = todayReceipts?.length ?? 0

  const { count: customerCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })

  const { count: itemCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  const stats = [
    { label: "Today's sales", value: formatCurrency(todaySales, shop?.currency, shop?.currency_symbol), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: "Today's transactions", value: todayCount.toString(), icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total customers', value: (customerCount ?? 0).toString(), icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Active items', value: (itemCount ?? 0).toString(), icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{shop?.name} - overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          )
        })}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/pos" className="bg-indigo-600 text-white rounded-xl p-4 hover:bg-indigo-700 transition-colors">
            <ShoppingCart className="w-5 h-5 mb-2" />
            <p className="font-medium">Open POS</p>
            <p className="text-xs text-indigo-200 mt-0.5">Start selling</p>
          </Link>
          <Link href="/items" className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
            <Package className="w-5 h-5 mb-2 text-gray-600" />
            <p className="font-medium text-gray-900">Manage items</p>
            <p className="text-xs text-gray-400 mt-0.5">Add or edit products</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
