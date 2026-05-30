'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog,
  BarChart2, Settings, LogOut, Monitor, ChevronDown,
  List, Tag, Sliders, FlaskConical,
  Zap, CreditCard, Heart, Percent, Receipt, Printer, UtensilsCrossed,
  CalendarClock, ClipboardList, ScanLine, ArrowLeftRight,
  ShieldCheck, KeyRound,
  Banknote, LayoutGrid, TrendingUp, History, BookOpen, Store,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Submenus ──────────────────────────────────────────────────────────────────
const itemsSubmenu = [
  { label: 'Item List',   href: '/items',       icon: List },
  { label: 'Categories',  href: '/categories',  icon: Tag },
  { label: 'Modifiers',   href: '/modifiers',   icon: Sliders },
  { label: 'Ingredients', href: '/ingredients', icon: FlaskConical },
]
const inventorySubmenu = [
  { label: 'Stock Levels',  href: '/inventory',     icon: Package },
  { label: 'Inventory Log', href: '/inventory-log', icon: History },
]
const hrSubmenu = [
  { label: 'Employees',  href: '/employees',     icon: UserCog },
  { label: 'Shifts',     href: '/hr/shifts',     icon: CalendarClock },
  { label: 'Attendance', href: '/hr/attendance', icon: ClipboardList },
  { label: 'Kiosk',      href: '/hr/kiosk',      icon: ScanLine },
  { label: 'Payroll',    href: '/hr/payroll',    icon: Banknote },
]
const financeSubmenu = [
  { label: 'Overview', href: '/finance',         icon: TrendingUp },
  { label: 'Journal',  href: '/finance/journal', icon: BookOpen },
]
const settingsSubmenu = [
  { label: 'Features',          href: '/settings/features',         icon: Zap },
  { label: 'Store Settings',    href: '/settings/store',            icon: Store },
  { label: 'Payment Types',     href: '/settings/payment-types',    icon: CreditCard },
  { label: 'Loyalty',           href: '/settings/loyalty',          icon: Heart },
  { label: 'Taxes & Discounts', href: '/settings/taxes-discounts',  icon: Percent },
  { label: 'Receipt',           href: '/settings/receipt',          icon: Receipt },
  { label: 'Dining Options',    href: '/settings/dining-options',   icon: UtensilsCrossed },
  { label: 'Users & POS',       href: '/settings/pos-settings',     icon: Monitor },
  { label: 'Roles',             href: '/settings/roles',            icon: ShieldCheck },
  { label: 'Permissions',       href: '/settings/permissions',      icon: KeyRound },
]

const itemsPaths     = ['/items', '/categories', '/modifiers', '/ingredients']
const inventoryPaths = ['/inventory', '/inventory-log']
const hrPaths        = ['/hr', '/employees']
const financePaths   = ['/finance']
const settingsPaths  = ['/settings']

// ── Starbucks signature green palette (lighter, warmer) ───────────────────────
const g = {
  sidebar:    '#00704A',                      // Starbucks signature green
  header:     '#005f3e',                      // slightly deeper for top section
  activeBg:   'rgba(255,255,255,0.18)',        // frosted white active
  activeText: '#ffffff',
  hoverBg:    'rgba(255,255,255,0.10)',        // subtle hover
  text:       'rgba(255,255,255,0.78)',        // nav text — warm white
  textMuted:  'rgba(255,255,255,0.42)',        // muted labels
  border:     'rgba(255,255,255,0.12)',        // dividers
  accent:     '#3de897',                      // bright mint dot / badges
  subLine:    'rgba(255,255,255,0.15)',
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({
  href, icon: Icon, label, isActive, onClick, chevron, chevronOpen,
}: {
  href?: string; icon: React.ElementType; label: string
  isActive: boolean; onClick?: () => void
  chevron?: boolean; chevronOpen?: boolean
}) {
  const cls = 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group'
  const style = {
    backgroundColor: isActive ? g.activeBg : 'transparent',
    color: isActive ? g.activeText : g.text,
    fontFamily: "'DM Sans', 'Inter', sans-serif",
  }
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = g.hoverBg
  }
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
  }

  const inner = (
    <span className="flex items-center gap-2.5 min-w-0 flex-1">
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
      {isActive && !chevron && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.accent }} />
      )}
    </span>
  )

  if (href) {
    return (
      <Link href={href} className={cls} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {inner}
      </Link>
    )
  }

  return (
    <button onClick={onClick} className={cls} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {inner}
      {chevron && (
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{ transform: chevronOpen ? 'rotate(0deg)' : 'rotate(-90deg)', color: g.textMuted }} />
      )}
    </button>
  )
}

// ── SubMenu ───────────────────────────────────────────────────────────────────
function SubMenu({ open, items, pathname }: {
  open: boolean
  items: { label: string; href: string; icon: React.ElementType }[]
  pathname: string
}) {
  if (!open) return null
  return (
    <div className="mt-0.5 ml-4 pl-3 space-y-0.5" style={{ borderLeft: `1.5px solid ${g.subLine}` }}>
      {items.map(sub => {
        const Icon = sub.icon
        const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
        return (
          <Link key={sub.href} href={sub.href}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
            style={{
              color: isActive ? g.activeText : g.textMuted,
              backgroundColor: isActive ? g.activeBg : 'transparent',
              fontFamily: "'DM Sans', 'Inter', sans-serif",
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = g.hoverBg }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {sub.label}
          </Link>
        )
      })}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: g.textMuted, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {label}
    </p>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ shop, userName, userRole }: {
  shop: any; userName?: string; userRole?: string
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const isItemsActive     = itemsPaths.some(p => pathname.startsWith(p))
  const isInventoryActive = inventoryPaths.some(p => pathname.startsWith(p))
  const isHrActive        = hrPaths.some(p => pathname.startsWith(p))
  const isFinanceActive   = financePaths.some(p => pathname.startsWith(p))
  const isSettingsActive  = settingsPaths.some(p => pathname.startsWith(p))

  const [itemsOpen,     setItemsOpen]     = useState(isItemsActive)
  const [inventoryOpen, setInventoryOpen] = useState(isInventoryActive)
  const [hrOpen,        setHrOpen]        = useState(isHrActive)
  const [financeOpen,   setFinanceOpen]   = useState(isFinanceActive)
  const [settingsOpen,  setSettingsOpen]  = useState(isSettingsActive)

  useEffect(() => { setItemsOpen(isItemsActive) },         [pathname])
  useEffect(() => { setInventoryOpen(isInventoryActive) }, [pathname])
  useEffect(() => { setHrOpen(isHrActive) },               [pathname])
  useEffect(() => { setFinanceOpen(isFinanceActive) },     [pathname])
  useEffect(() => { setSettingsOpen(isSettingsActive) },   [pathname])

  const firstName = userName?.trim().split(' ')[0] ?? 'User'
  const role      = userRole ?? 'cashier'
  const initial   = firstName.charAt(0).toUpperCase()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    toast.success('Signed out')
  }

  const roleBadge: Record<string, { bg: string; text: string }> = {
    owner:   { bg: 'rgba(61,232,151,0.25)',   text: '#3de897' },
    manager: { bg: 'rgba(255,255,255,0.15)',   text: '#d4f0e3' },
    cashier: { bg: 'rgba(255,255,255,0.10)',   text: 'rgba(255,255,255,0.65)' },
  }
  const rb = roleBadge[role] ?? roleBadge.cashier

  return (
    <aside className="w-56 flex flex-col h-full flex-shrink-0 select-none"
      style={{ backgroundColor: g.sidebar, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* ── User header ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4" style={{ backgroundColor: g.header, borderBottom: `1px solid ${g.border}` }}>
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <img
  src="/Capture.jpg"
  alt={firstName}
  className="w-9 h-9 rounded-xl flex-shrink-0 object-cover"
/>

          {/* Name + role + store */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#fff' }}>{firstName}</p>
            <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
              style={{ backgroundColor: rb.bg, color: rb.text }}>
              {role}
            </span>
            {shop?.name && (
              <p className="text-[10px] mt-1 truncate flex items-center gap-1" style={{ color: g.textMuted }}>
                <Store className="w-2.5 h-2.5 flex-shrink-0" />
                {shop.name}
              </p>
            )}
          </div>

          {/* Logout */}
          <button onClick={handleSignOut} title="Sign out"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150"
            style={{ color: g.textMuted }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'rgba(248,113,113,0.2)'
              el.style.color = '#f87171'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'transparent'
              el.style.color = g.textMuted
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2.5 py-2 overflow-y-auto space-y-0.5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: `${g.border} transparent` }}>

        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" isActive={pathname === '/dashboard'} />

        <SectionLabel label="Catalogue" />
        <NavItem icon={Package} label="Items" isActive={isItemsActive}
          onClick={() => setItemsOpen(p => !p)} chevron chevronOpen={itemsOpen} />
        <SubMenu open={itemsOpen} items={itemsSubmenu} pathname={pathname} />

        <NavItem icon={Package} label="Inventory" isActive={isInventoryActive}
          onClick={() => setInventoryOpen(p => !p)} chevron chevronOpen={inventoryOpen} />
        <SubMenu open={inventoryOpen} items={inventorySubmenu} pathname={pathname} />

        <SectionLabel label="Operations" />
        <NavItem icon={CalendarClock} label="HR" isActive={isHrActive}
          onClick={() => setHrOpen(p => !p)} chevron chevronOpen={hrOpen} />
        <SubMenu open={hrOpen} items={hrSubmenu} pathname={pathname} />

        <NavItem icon={TrendingUp} label="Finance" isActive={isFinanceActive}
          onClick={() => setFinanceOpen(p => !p)} chevron chevronOpen={financeOpen} />
        <SubMenu open={financeOpen} items={financeSubmenu} pathname={pathname} />

        <NavItem href="/reports" icon={BarChart2} label="Reports" isActive={pathname.startsWith('/reports')} />

        <SectionLabel label="Commerce" />
        <NavItem href="/customers" icon={Users} label="Customers" isActive={pathname.startsWith('/customers')} />
        <NavItem href="/transactions" icon={ArrowLeftRight} label="Transactions" isActive={pathname.startsWith('/transactions')} />
        <NavItem href="/staff" icon={LayoutGrid} label="Staff Dashboard" isActive={pathname === '/staff'} />
        <NavItem href="/pos" icon={ShoppingCart} label="POS" isActive={pathname.startsWith('/pos')} />

        <div className="pt-3 pb-1" style={{ borderTop: `1px solid ${g.border}`, marginTop: '8px' }}>
          <NavItem icon={Settings} label="Settings" isActive={isSettingsActive}
            onClick={() => setSettingsOpen(p => !p)} chevron chevronOpen={settingsOpen} />
          <SubMenu open={settingsOpen} items={settingsSubmenu} pathname={pathname} />
        </div>

      </nav>

      {/* ── Kitchen Printers ─────────────────────────────────────────────── */}
      <div className="px-2.5 pb-3 pt-2" style={{ borderTop: `1px solid ${g.border}` }}>
        <NavItem href="/settings/kitchen-printers" icon={Printer} label="Kitchen Printers" isActive={pathname === '/settings/kitchen-printers'} />
        {shop?.kds_enabled && (
          <NavItem href="/kds" icon={Monitor} label="Kitchen Display" isActive={pathname === '/kds'} />
        )}
      </div>
    </aside>
  )
}
