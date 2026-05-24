'use client'

import { useState } from 'react'
import SummaryCards from '@/components/reports/SummaryCards'
import SalesChart from '@/components/reports/SalesChart'
import TopItemsTable from '@/components/reports/TopItemsTable'
import { useReportsData } from '@/lib/hooks/useReports'
import { DateRangeFilter } from '@/components/reports/DateRangeFilter'

export type DateRange = {
  from: string
  to: string
  label: string
}

const PRESETS: DateRange[] = [
  {
    label: 'Today',
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 7 days',
    from: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'Last 30 days',
    from: new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  {
    label: 'This month',
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
]

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(PRESETS[2]) // default: last 30 days
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const { summary, chartData, topItems, isLoading } = useReportsData({
    from: dateRange.from,
    to: dateRange.to,
    groupBy,
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {dateRange.label} · {dateRange.from} → {dateRange.to}
          </p>
        </div>

        <DateRangeFilter
          presets={PRESETS}
          selected={dateRange}
          onSelect={setDateRange}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      </div>

      {/* KPI Cards */}
      <SummaryCards data={summary} isLoading={isLoading} />

      {/* Sales Chart */}
      <SalesChart data={chartData} groupBy={groupBy} isLoading={isLoading} />

      {/* Top Items Table */}
      <TopItemsTable data={topItems} isLoading={isLoading} />
    </div>
  )
}
