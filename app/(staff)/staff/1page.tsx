'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ShoppingCart, Package, Receipt, Clock,
  Printer, Sun, Moon, Sunset,
} from 'lucide-react'

const STAFF_TILES = [
  {
    permission: 'page_pos',
    href: '/pos',
    label: 'Point of Sale',
    icon: ShoppingCart,
    color: 'bg-indigo-500',
    light: 'bg-indigo-50',
    text: 'text-indigo-600',
  },
  {
    permission: 'page_inventory',
    href: '/inventory',
    label: 'Inventory',
    icon: Package,
    color: 'bg-emerald-500',
    light: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    permission: 'page_transactions',
    href: '/transactions',
    label: 'Transactions',
    icon: Receipt,
    color: 'bg-violet-500',
    light: 'bg-violet-50',
    text: 'text-violet-600',
  },
  {
    permission: 'page_kiosk',
    href: '/hr/kiosk',
    label: 'Clock In / Out',
    icon: Clock,
    color: 'bg-amber-500',
    light: 'bg-amber-50',
    text: 'text-amber-600',
  },
  {
    permission: 'page_kitchen_printers',
    href: '/settings/kitchen-printers',
    label: 'Printer Setup',
    icon: Printer,
    color: 'bg-teal-500',
    light: 'bg-teal-50',
    text: 'text-teal-600',
    alwaysVisible: true,
  },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', Icon: Sun }
  if (h < 18) return { text: 'Good afternoon', Icon: Sunset }
  return { text: 'Good evening', Icon: Moon }
}

export default function StaffDashboardPage() {
  const [userName, setUserName] = useState('')
  const [allowedPerms, setAllowedPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState<Date | null>(null)

  useEffect(() => {
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/me')
        if (res.ok) {
          const data = await res.json()
          setUserName(data.name ?? '')
          setAllowedPerms(data.permissions ?? [])
        }
      } catch {
        setAllowedPerms(STAFF_TILES.map(t => t.permission))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const visibleTiles = STAFF_TILES.filter(t => t.alwaysVisible || allowedPerms.includes(t.permission))
  const { text: greetingText, Icon: GreetingIcon } = getGreeting()

  const timeStr = time
    ? time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '--:-- --'
  const dateStr = time
    ? time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GreetingIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {greetingText}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </p>
            <p className="text-xs text-gray-400 truncate">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <p className="text-base font-bold text-gray-900 tabular-nums">{timeStr}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log Out
          </button>
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 p-5 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        ) : visibleTiles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="font-medium">No modules available</p>
            <p className="text-sm mt-1">Contact your manager to grant access.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 max-w-2xl mx-auto pt-4">
            {visibleTiles.map(tile => {
              const Icon = tile.icon
              return (
                <Link
                  key={tile.permission}
                  href={tile.href}
                  className="flex flex-col items-center gap-2.5 group active:scale-95 transition-transform duration-150 select-none"
                >
                  {/* Circle icon */}
                  <div className={`
                    w-16 h-16 rounded-2xl ${tile.color}
                    flex items-center justify-center
                    shadow-md group-hover:shadow-lg
                    transition-all duration-150
                    group-hover:scale-105
                  `}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  {/* Label */}
                  <span className="text-xs font-medium text-gray-600 text-center leading-tight px-1">
                    {tile.label}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <footer className="px-5 py-3 text-center">
        <p className="text-xs text-gray-300">Staff Portal</p>
      </footer>
    </div>
  )
}
