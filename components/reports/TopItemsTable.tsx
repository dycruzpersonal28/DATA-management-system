'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type TopItem = {
  itemName: string
  unitsSold: number
  revenue: number
  numOrders: number
}

type Props = {
  data: TopItem[]
  isLoading: boolean
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)
}

export default function TopItemsTable({ data, isLoading }: Props) {
  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-800">
          Top Selling Items
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b">
              <TableHead className="pl-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Item
              </TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                Units Sold
              </TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                Orders
              </TableHead>
              <TableHead className="pr-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                Revenue
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-6"><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="pr-6"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-gray-400">
                  No sales data for this period
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, idx) => (
                <TableRow key={item.itemName} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="pl-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-400 w-5 text-right tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-800">{item.itemName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-600 tabular-nums">
                    {item.unitsSold.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-600 tabular-nums">
                    {item.numOrders.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-sm font-semibold text-gray-800 tabular-nums">
                    {formatCurrency(item.revenue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
