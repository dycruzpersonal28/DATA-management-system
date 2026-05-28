'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog,
  BarChart2, Settings, LogOut, Monitor, ChevronDown, ChevronRight,
  List, Tag, Sliders, FlaskConical,
  Zap, CreditCard, Heart, Percent, Receipt, Printer, UtensilsCrossed,
  CalendarClock, ClipboardList, ScanLine, ArrowLeftRight,
  ShieldCheck, KeyRound,
  Banknote, LayoutGrid, TrendingUp, History
} from 'lucide-react'
import { toast } from 'sonner'

const itemsSubmenu = [
  { label: 'Item List',    href: '/items',       icon: List },
  { label: 'Categories',   href: '/categories',  icon: Tag },
  { label: 'Modifiers',    href: '/modifiers',   icon: Sliders },
  { label: 'Ingredients',  href: '/ingredients', icon: FlaskConical },
]

const settingsSubmenu = [
  { label: 'Features',          href: '/settings/features',         icon: Zap },
  { label: 'Payment Types',     href: '/settings/payment-types',    icon: CreditCard },
  { label: 'Loyalty',           href: '/settings/loyalty',          icon: Heart },
  { label: 'Taxes & Discounts', href: '/settings/taxes-discounts',  icon: Percent },
  { label: 'Receipt',           href: '/settings/receipt',          icon: Receipt },
  { label: 'Kitchen Printers',  href: '/settings/kitchen-printers', icon: Printer },
  { label: 'Dining Options',    href: '/settings/dining-options',   icon: UtensilsCrossed },
  { label: 'Users & POS',       href: '/settings/pos-settings',     icon: Monitor },
  { label: 'Roles',             href: '/settings/roles',             icon: ShieldCheck },
  { label: 'Permissions',       href: '/settings/permissions',       icon: KeyRound },
]

const hrSubmenu = [
  { label: 'Employees',  href: '/employees',      icon: UserCog },
  { label: 'Shifts',     href: '/hr/shifts',      icon: CalendarClock },
  { label: 'Attendance', href: '/hr/attendance',  icon: ClipboardList },
  { label: 'Kiosk',      href: '/hr/kiosk',       icon: ScanLine },
  { label: 'Payroll',    href: '/hr/payroll',     icon: Banknote },
]

const inventorySubmenu = [
  { label: 'Stock Levels',  href: '/inventory',     icon: Package },
  { label: 'Inventory Log', href: '/inventory-log', icon: History },
]

const navItems = [
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { label: 'Customers',    href: '/customers',    icon: Users },
  { label: 'Finance',      href: '/finance',      icon: TrendingUp },
  { label: 'Reports',      href: '/reports',      icon: BarChart2 },
]

const itemsPaths      = ['/items', '/categories', '/modifiers', '/ingredients']
const inventoryPaths  = ['/inventory', '/inventory-log']
const settingsPaths   = ['/settings']
const hrPaths         = ['/hr', '/employees']

const roleStyle: Record<string, string> = {
  owner:   'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  cashier: 'bg-gray-100 text-gray-600',
}

export default function Sidebar({
  shop,
  userName,
  userRole,
}: {
  shop: any
  userName?: string
  userRole?: string
}) {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()

  const isItemsActive      = itemsPaths.some(p => pathname.startsWith(p))
  const isInventoryActive  = inventoryPaths.some(p => pathname.startsWith(p))
  const isSettingsActive   = settingsPaths.some(p => pathname.startsWith(p))
  const isHrActive         = hrPaths.some(p => pathname.startsWith(p))
  const [itemsOpen,     setItemsOpen]     = useState(isItemsActive)
  const [inventoryOpen, setInventoryOpen] = useState(isInventoryActive)
  const [settingsOpen,  setSettingsOpen]  = useState(isSettingsActive)
  const [hrOpen,        setHrOpen]        = useState(isHrActive)

  useEffect(() => { setItemsOpen(isItemsActive) },         [pathname])
  useEffect(() => { setInventoryOpen(isInventoryActive) }, [pathname])
  useEffect(() => { setSettingsOpen(isSettingsActive) },   [pathname])
  useEffect(() => { setHrOpen(isHrActive) },               [pathname])

  // Show only the first name
  const firstName = userName?.trim().split(' ')[0] ?? 'User'
  const role      = userRole ?? 'cashier'
  const initial   = firstName.charAt(0).toUpperCase()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    toast.success('Signed out')
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">

      {/* Shop header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{shop?.name}</p>
            <p className="text-xs text-gray-400">Back Office</p>
          </div>
        </div>
      </div>

      {/* User card + sign out */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{initial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{firstName}</p>
            <span className={cn('inline-block px-1.5 py-0 rounded text-xs font-medium leading-4', roleStyle[role] ?? roleStyle.cashier)}>
              {role}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <Link href="/dashboard" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />Dashboard
        </Link>

        <Link href="/pos" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/pos' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <ShoppingCart className="w-4 h-4 flex-shrink-0" />POS
        </Link>

        <Link href="/staff" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/staff' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <LayoutGrid className="w-4 h-4 flex-shrink-0" />Staff Dashboard
        </Link>

        {/* Items submenu */}
        <div>
          <button
            onClick={() => setItemsOpen(prev => !prev)}
            className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors', isItemsActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
          >
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 flex-shrink-0" />Items
            </div>
            {itemsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {itemsOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
              {itemsSubmenu.map(sub => {
                const Icon = sub.icon
                const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <Link key={sub.href} href={sub.href}
                    className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />{sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <Link href="/transactions" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname.startsWith('/transactions') ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <ArrowLeftRight className="w-4 h-4 flex-shrink-0" />Transactions
        </Link>

        {/* Inventory submenu */}
        <div>
          <button
            onClick={() => setInventoryOpen(prev => !prev)}
            className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors', isInventoryActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
          >
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 flex-shrink-0" />Inventory
            </div>
            {inventoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {inventoryOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
              {inventorySubmenu.map(sub => {
                const Icon = sub.icon
                const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <Link key={sub.href} href={sub.href}
                    className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />{sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <Link href="/customers" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname.startsWith('/customers') ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <Users className="w-4 h-4 flex-shrink-0" />Customers
        </Link>

        <Link href="/finance" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname.startsWith('/finance') ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <TrendingUp className="w-4 h-4 flex-shrink-0" />Finance
        </Link>

        <Link href="/reports" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname.startsWith('/reports') ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <BarChart2 className="w-4 h-4 flex-shrink-0" />Reports
        </Link>

        {/* HR submenu */}
        <div>
          <button
            onClick={() => setHrOpen(prev => !prev)}
            className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors', isHrActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
          >
            <div className="flex items-center gap-2.5">
              <CalendarClock className="w-4 h-4 flex-shrink-0" />HR
            </div>
            {hrOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {hrOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
              {hrSubmenu.map(sub => {
                const Icon = sub.icon
                const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <Link key={sub.href} href={sub.href}
                    className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />{sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings submenu */}
        <div>
          <button
            onClick={() => setSettingsOpen(prev => !prev)}
            className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors', isSettingsActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 flex-shrink-0" />Settings
            </div>
            {settingsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {settingsOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
              {settingsSubmenu.map(sub => {
                const Icon = sub.icon
                const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <Link key={sub.href} href={sub.href}
                    className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />{sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      {shop?.kds_enabled && (
        <div className="px-3 pb-2">
          <Link href="/kds" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Monitor className="w-4 h-4" />Kitchen Display
          </Link>
        </div>
      )}

    </aside>
  )
}
