'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, ShoppingCart, Tag, BarChart2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type SummaryData = {
  grossSales: number
  refunds: number
  discounts: number
  netSales: number
  costOfGoods: number
  grossProfit: number
  transactions: number
  avgSale: number
}

type Props = {
  data?: SummaryData
  isLoading: boolean
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)
}

const CARDS = [
  {
    key: 'grossSales' as keyof SummaryData,
    label: 'Gross Sales',
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    key: 'netSales' as keyof SummaryData,
    label: 'Net Sales',
    icon: BarChart2,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'transactions' as keyof SummaryData,
    label: 'Transactions',
    icon: ShoppingCart,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    isCount: true,
  },
  {
    key: 'avgSale' as keyof SummaryData,
    label: 'Avg. Sale',
    icon: Tag,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
]

export default function SummaryCards({ data, isLoading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, color, bg, isCount }) => (
        <Card key={key} className="border border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <span className="text-sm text-gray-500 font-medium">{label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {isCount
                  ? (data?.[key] ?? 0).toLocaleString()
                  : formatCurrency(data?.[key] as number ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
