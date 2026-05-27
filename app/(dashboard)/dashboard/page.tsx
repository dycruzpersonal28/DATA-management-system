import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { ShoppingCart, Users, Package, TrendingUp, Receipt, ArrowRight, ClipboardList } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: shop } = await supabase.from('shops').select('*').single()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayReceipts } = await supabase
    .from('receipts')
    .select('total, receipt_number, created_at, status')
    .eq('status', 'completed')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })

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

  const sym = shop?.currency_symbol || '$'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{shop?.name} — overview</p>
      </div>

      {/* Stats */}
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

      {/* Quick actions */}
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
          <Link href="/transactions" className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
            <Receipt className="w-5 h-5 mb-2 text-gray-600" />
            <p className="font-medium text-gray-900">Transactions</p>
            <p className="text-xs text-gray-400 mt-0.5">View & export sales history</p>
          </Link>
          <Link href="/inventory-log" className="bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
            <ClipboardList className="w-5 h-5 mb-2 text-gray-600" />
            <p className="font-medium text-gray-900">Inventory Log</p>
            <p className="text-xs text-gray-400 mt-0.5">Stock movement history</p>
          </Link>
        </div>
      </div>

      {/* Today's transactions log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500">Today's transactions</h2>
          <Link href="/transactions" className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!todayReceipts || todayReceipts.length === 0 ? (
            <div className="p-8 text-center">
              <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No transactions today yet</p>
              <Link href="/pos" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">Open POS to start selling</Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Receipt #</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Time</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-2.5">Total</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {todayReceipts.slice(0, 10).map(r => (
                  <tr key={r.receipt_number} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-indigo-600">{r.receipt_number}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm text-gray-600">
                        {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-semibold text-gray-900">{sym}{r.total.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {todayReceipts && todayReceipts.length > 10 && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <Link href="/transactions" className="text-xs text-indigo-600 hover:underline">
                +{todayReceipts.length - 10} more — view all transactions
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
