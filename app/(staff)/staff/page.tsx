'use client'

// /app/(dashboard)/staff/page.tsx
// Staff-facing dashboard — optimized for 8" tablet, scales up on larger screens
// Only shows tiles the user actually has permission to access

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ShoppingCart,
  Package,
  Receipt,
  Clock,
  ChevronRight,
  Sun,
  Moon,
  Sunset,
} from 'lucide-react'

// ─── Permission → tile config ─────────────────────────────────────────────────

const STAFF_TILES = [
  {
    permission: 'page_pos',
    href: '/pos',
    label: 'Point of Sale',
    sublabel: 'Open register & sell',
    icon: ShoppingCart,
    accent: 'from-indigo-600 to-indigo-500',
    glow: 'shadow-indigo-200',
    iconBg: 'bg-indigo-700/40',
    primary: true,
  },
  {
    permission: 'page_inventory',
    href: '/inventory',
    label: 'Inventory',
    sublabel: 'Check stock levels',
    icon: Package,
    accent: 'from-emerald-600 to-emerald-500',
    glow: 'shadow-emerald-200',
    iconBg: 'bg-emerald-700/40',
    primary: false,
  },
  {
    permission: 'page_transactions',
    href: '/transactions',
    label: 'Transactions',
    sublabel: 'Sales & receipts',
    icon: Receipt,
    accent: 'from-violet-600 to-violet-500',
    glow: 'shadow-violet-200',
    iconBg: 'bg-violet-700/40',
    primary: false,
  },
  {
    permission: 'page_kiosk',
    href: '/hr/kiosk',
    label: 'Clock In / Out',
    sublabel: 'Attendance kiosk',
    icon: Clock,
    accent: 'from-amber-500 to-orange-500',
    glow: 'shadow-amber-200',
    iconBg: 'bg-amber-600/40',
    primary: false,
  },
]

// ─── Greeting helper ──────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', Icon: Sun }
  if (h < 18) return { text: 'Good afternoon', Icon: Sunset }
  return { text: 'Good evening', Icon: Moon }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffDashboardPage() {
  const [userName, setUserName] = useState<string>('')
  const [allowedPerms, setAllowedPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(() => new Date())

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch current user's permissions from session
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
        // If /api/me doesn't exist yet, show all tiles as fallback
        setAllowedPerms(STAFF_TILES.map(t => t.permission))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const visibleTiles = STAFF_TILES.filter(t => allowedPerms.includes(t.permission))

  const { text: greetingText, Icon: GreetingIcon } = getGreeting()

  const timeStr = time.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const dateStr = time.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GreetingIcon className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {greetingText}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </p>
            <p className="text-xs text-gray-400">{dateStr}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight">{timeStr}</p>
        </div>
      </header>

      {/* ── Tile grid ─────────────────────────────────────────────────────── */}
      <main className="flex-1 p-5 flex flex-col justify-center">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading…
          </div>
        ) : visibleTiles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="font-medium">No modules available</p>
            <p className="text-sm mt-1">Contact your manager to grant access.</p>
          </div>
        ) : (
          <div className={`
            grid gap-4 w-full max-w-2xl mx-auto
            ${visibleTiles.length === 1 ? 'grid-cols-1' : ''}
            ${visibleTiles.length === 2 ? 'grid-cols-2' : ''}
            ${visibleTiles.length === 3 ? 'grid-cols-2' : ''}
            ${visibleTiles.length === 4 ? 'grid-cols-2' : ''}
          `}>
            {visibleTiles.map((tile, i) => {
              const Icon = tile.icon
              const isLast = visibleTiles.length === 3 && i === 2

              return (
                <Link
                  key={tile.permission}
                  href={tile.href}
                  className={`
                    relative overflow-hidden rounded-2xl
                    bg-gradient-to-br ${tile.accent}
                    shadow-lg ${tile.glow}
                    active:scale-95 transition-transform duration-150
                    flex flex-col justify-between
                    p-5 min-h-[140px]
                    sm:min-h-[160px]
                    lg:min-h-[180px]
                    ${isLast ? 'col-span-2' : ''}
                    select-none
                  `}
                >
                  {/* Background decoration */}
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-white/10" />
                  <div className="absolute -right-2 -bottom-10 w-20 h-20 rounded-full bg-white/5" />

                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl ${tile.iconBg} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  {/* Label */}
                  <div className="mt-auto">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-white font-semibold text-base sm:text-lg leading-tight">
                          {tile.label}
                        </p>
                        <p className="text-white/70 text-xs mt-0.5">{tile.sublabel}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/50 flex-shrink-0 mb-0.5" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="px-5 py-3 text-center">
        <p className="text-xs text-gray-300">Staff Portal</p>
      </footer>
    </div>
  )
}
