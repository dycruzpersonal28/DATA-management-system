'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CalendarDays, ChevronDown } from 'lucide-react'
import type { DateRange } from '@/app/(dashboard)/reports/page'

type Props = {
  presets: DateRange[]
  selected: DateRange
  onSelect: (range: DateRange) => void
  groupBy: 'day' | 'week' | 'month'
  onGroupByChange: (groupBy: 'day' | 'week' | 'month') => void
}

const GROUP_OPTIONS: { value: 'day' | 'week' | 'month'; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function DateRangeFilter({
  presets,
  selected,
  onSelect,
  groupBy,
  onGroupByChange,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* Group By toggle */}
      <div className="flex rounded-md border border-gray-200 overflow-hidden">
        {GROUP_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onGroupByChange(value)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              groupBy === value
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date preset dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-sm">
            <CalendarDays className="w-4 h-4" />
            {selected.label}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              onClick={() => onSelect(preset)}
              className={`text-sm cursor-pointer ${
                selected.label === preset.label ? 'font-semibold text-gray-900' : 'text-gray-700'
              }`}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
