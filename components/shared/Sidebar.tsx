'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog,
  BarChart2, Settings, LogOut, Monitor, ChevronDown, ChevronRight,
  List, Tag, Sliders, FlaskConical
} from 'lucide-react'
import { toast } from 'sonner'

const itemsSubmenu = [
  { label: 'Item List',    href: '/items',       icon: List },
  { label: 'Categories',   href: '/categories',  icon: Tag },
  { label: 'Modifiers',    href: '/modifiers',   icon: Sliders },
  { label: 'Ingredients',  href: '/ingredients', icon: FlaskConical },
]

const navItems = [
  { label: 'Inventory', href: '/inventory',  icon: Package },
  { label: 'Customers', href: '/customers',  icon: Users },
  { label: 'Employees', href: '/employees',  icon: UserCog },
  { label: 'Reports',   href: '/reports',    icon: BarChart2 },
  { label: 'Settings',  href: '/settings',   icon: Settings },
]

const itemsPaths = ['/items', '/categories', '/modifiers', '/ingredients']

export default function Sidebar({ shop }: { shop: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isItemsActive = itemsPaths.some(p => pathname.startsWith(p))
  const [itemsOpen, setItemsOpen] = useState(isItemsActive)

  useEffect(() => {
    if (!isItemsActive) setItemsOpen(false)
    else setItemsOpen(true)
  }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    toast.success('Signed out')
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
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

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <Link href="/dashboard" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />Dashboard
        </Link>

        <Link href="/pos" className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', pathname === '/pos' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
          <ShoppingCart className="w-4 h-4 flex-shrink-0" />POS
        </Link>

        {/* Items with submenu */}
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

        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors', isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />{item.label}
            </Link>
          )
        })}
      </nav>

      {shop?.kds_enabled && (
        <div className="px-3 pb-2">
          <Link href="/kds" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Monitor className="w-4 h-4" />Kitchen Display
          </Link>
        </div>
      )}

      <div className="p-3 border-t border-gray-100">
        <button onClick={handleSignOut} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 w-full transition-colors">
          <LogOut className="w-4 h-4" />Sign out
        </button>
      </div>
    </aside>
  )
}
