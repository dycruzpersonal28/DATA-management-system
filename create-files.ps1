# ============================================================
# POS SYSTEM - CREATE ALL PHASE 1 FILES
# Run this in PowerShell from your project root folder:
# C:\Users\ALLISON\Documents\data-management-system>
# Just paste this command:  .\create-files.ps1
# ============================================================

# .env.local
@'
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECTID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
'@ | Set-Content -Path ".env.local" -Encoding UTF8

# .env.example
@'
NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
'@ | Set-Content -Path ".env.example" -Encoding UTF8

# next.config.js
@'
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
'@ | Set-Content -Path "next.config.js" -Encoding UTF8

# vercel.json
@'
{
  "crons": [
    {
      "path": "/api/ping",
      "schedule": "0 */6 * * *"
    }
  ]
}
'@ | Set-Content -Path "vercel.json" -Encoding UTF8

# lib/supabase/client.ts
@'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
'@ | Set-Content -Path "lib/supabase/client.ts" -Encoding UTF8

# lib/supabase/server.ts
@'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component - cookies set in middleware
          }
        },
      },
    }
  )
}
'@ | Set-Content -Path "lib/supabase/server.ts" -Encoding UTF8

# middleware.ts
@'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/pin')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  const isPublic = isAuthPage || isApiRoute

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
'@ | Set-Content -Path "middleware.ts" -Encoding UTF8

# lib/types/database.ts
@'
export interface Shop {
  id: string
  owner_id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  currency: string
  currency_symbol: string
  timezone: string
  tax_inclusive: boolean
  loyalty_enabled: boolean
  kds_enabled: boolean
  printer_enabled: boolean
  logo_url: string | null
  receipt_header: string | null
  receipt_footer: string | null
  points_per_dollar: number
  points_redemption_rate: number
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  shop_id: string
  name: string
  email: string | null
  pin: string
  role: 'owner' | 'manager' | 'cashier'
  is_active: boolean
  can_apply_discounts: boolean
  can_void_sales: boolean
  can_view_reports: boolean
  can_manage_inventory: boolean
  created_at: string
}

export interface Category {
  id: string
  shop_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface Item {
  id: string
  shop_id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  cost: number
  sku: string | null
  barcode: string | null
  image_url: string | null
  track_stock: boolean
  is_active: boolean
  sold_by_weight: boolean
  tax_rate: number
  created_at: string
  updated_at: string
  categories?: Category
  inventory_levels?: InventoryLevel[]
}

export interface InventoryLevel {
  id: string
  shop_id: string
  item_id: string
  variant_id: string | null
  quantity: number
  low_stock_alert: number
}

export interface Customer {
  id: string
  shop_id: string
  name: string
  email: string | null
  phone: string | null
  loyalty_points: number
  total_visits: number
  total_spent: number
  birthday: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Receipt {
  id: string
  shop_id: string
  employee_id: string | null
  customer_id: string | null
  receipt_number: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_type_id: string | null
  amount_tendered: number | null
  change_amount: number | null
  loyalty_points_earned: number
  loyalty_points_redeemed: number
  note: string | null
  status: 'completed' | 'voided' | 'refunded'
  created_at: string
  employees?: Employee
  customers?: Customer
  payment_types?: PaymentType
  receipt_items?: ReceiptItem[]
}

export interface ReceiptItem {
  id: string
  receipt_id: string
  item_id: string | null
  variant_id: string | null
  item_name: string
  variant_name: string | null
  unit_price: number
  quantity: number
  discount_amount: number
  tax_amount: number
  line_total: number
  modifiers: { name: string; price: number }[]
  note: string | null
}

export interface PaymentType {
  id: string
  shop_id: string
  name: string
  is_active: boolean
  sort_order: number
}

export interface CartItem {
  id: string
  itemId: string
  variantId?: string
  name: string
  variantName?: string
  price: number
  quantity: number
  modifiers: { name: string; price: number }[]
  note?: string
  lineTotal: number
  trackStock: boolean
}
'@ | Set-Content -Path "lib/types/database.ts" -Encoding UTF8

# lib/hooks/useCart.ts
@'
import { create } from 'zustand'
import { CartItem } from '@/lib/types/database'

interface CartState {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  discountAmount: number
  discountLabel: string
  addItem: (item: Omit<CartItem, 'id' | 'lineTotal'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateNote: (id: string, note: string) => void
  setCustomer: (id: string | null, name: string | null) => void
  setDiscount: (amount: number, label: string) => void
  clearCart: () => void
  subtotal: () => number
  total: () => number
  itemCount: () => number
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  discountAmount: 0,
  discountLabel: '',

  addItem: (item) =>
    set((state) => {
      const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0)
      const unitPrice = item.price + modTotal
      const lineTotal = unitPrice * item.quantity

      const existingIdx = state.items.findIndex(
        (i) =>
          i.itemId === item.itemId &&
          i.variantId === item.variantId &&
          JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers)
      )

      if (existingIdx >= 0) {
        const updated = [...state.items]
        const ex = updated[existingIdx]
        const newQty = ex.quantity + item.quantity
        updated[existingIdx] = {
          ...ex,
          quantity: newQty,
          lineTotal: unitPrice * newQty,
        }
        return { items: updated }
      }

      return {
        items: [
          ...state.items,
          { ...item, id: crypto.randomUUID(), lineTotal },
        ],
      }
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  updateQuantity: (id, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.id !== id)
          : state.items.map((i) =>
              i.id === id
                ? { ...i, quantity, lineTotal: i.price * quantity }
                : i
            ),
    })),

  updateNote: (id, note) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, note } : i)),
    })),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  setDiscount: (amount, label) =>
    set({ discountAmount: amount, discountLabel: label }),
  clearCart: () =>
    set({
      items: [],
      customerId: null,
      customerName: null,
      discountAmount: 0,
      discountLabel: '',
    }),

  subtotal: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
  total: () => Math.max(0, get().subtotal() - get().discountAmount),
  itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
}))
'@ | Set-Content -Path "lib/hooks/useCart.ts" -Encoding UTF8

# lib/utils/formatCurrency.ts
@'
export function formatCurrency(
  amount: number,
  currency = 'USD',
  symbol = '$'
): string {
  return `${symbol}${amount.toFixed(2)}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
'@ | Set-Content -Path "lib/utils/formatCurrency.ts" -Encoding UTF8

# lib/utils/loyalty.ts
@'
export function calculatePointsEarned(
  total: number,
  pointsPerDollar = 1
): number {
  return Math.floor(total * pointsPerDollar)
}

export function calculateRedemptionValue(
  points: number,
  redemptionRate = 100
): number {
  return points / redemptionRate
}

export function calculateMaxRedeemable(
  points: number,
  orderTotal: number,
  redemptionRate = 100
): number {
  const maxFromPoints = calculateRedemptionValue(points, redemptionRate)
  return Math.min(maxFromPoints, orderTotal)
}
'@ | Set-Content -Path "lib/utils/loyalty.ts" -Encoding UTF8

# app/layout.tsx
@'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'POS System',
  description: 'Point of Sale Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
'@ | Set-Content -Path "app/layout.tsx" -Encoding UTF8

# app/page.tsx
@'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
'@ | Set-Content -Path "app/page.tsx" -Encoding UTF8

# app/(auth)/login/page.tsx
New-Item -ItemType Directory -Force -Path "app/(auth)/login" | Out-Null
@'
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ShoppingCart, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Account created! Please check your email to confirm.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        toast.error('Invalid email or password')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">POS System</h1>
          <p className="text-sm text-gray-500">Point of Sale Management</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isSignUp ? 'Create account' : 'Sign in'}</CardTitle>
            <CardDescription>
              {isSignUp
                ? 'Create your account to get started'
                : 'Enter your credentials to access your store'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="........"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <span className="text-gray-500">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </span>{' '}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-indigo-600 hover:underline font-medium"
              >
                {isSignUp ? 'Sign in' : 'Create one'}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500">
          Are you an employee?{' '}
          <a href="/pin" className="text-indigo-600 hover:underline">
            Use PIN login
          </a>
        </p>
      </div>
    </div>
  )
}
'@ | Set-Content -Path "app/(auth)/login/page.tsx" -Encoding UTF8

# app/(auth)/pin/page.tsx
New-Item -ItemType Directory -Force -Path "app/(auth)/pin" | Out-Null
@'
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Delete, ArrowLeft } from 'lucide-react'

export default function PinPage() {
  const router = useRouter()
  const supabase = createClient()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shopName, setShopName] = useState('POS System')

  useEffect(() => {
    async function loadShop() {
      const { data } = await supabase.from('shops').select('name').single()
      if (data) setShopName(data.name)
    }
    loadShop()
  }, [])

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin(pin)
    }
  }, [pin])

  async function verifyPin(enteredPin: string) {
    setError('')
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('pin', enteredPin)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      setError('Incorrect PIN. Try again.')
      setTimeout(() => {
        setPin('')
        setError('')
      }, 1500)
      return
    }

    localStorage.setItem('pos_employee', JSON.stringify({
      id: data.id,
      name: data.name,
      role: data.role,
      can_apply_discounts: data.can_apply_discounts,
      can_void_sales: data.can_void_sales,
    }))

    router.push('/pos')
  }

  function pressKey(key: string) {
    if (pin.length < 4) setPin(prev => prev + key)
  }

  function deleteLast() {
    setPin(prev => prev.slice(0, -1))
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del']

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <h1 className="text-white text-2xl font-semibold">{shopName}</h1>
          <p className="text-gray-400 text-sm mt-1">Enter your PIN to start</p>
        </div>
        <div className="flex justify-center gap-4">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${
                pin.length > i ? 'bg-indigo-400 scale-110' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
        {error && (
          <p className="text-center text-red-400 text-sm">{error}</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((key, i) => {
            if (key === '') return <div key={i} />
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={deleteLast}
                  className="h-16 rounded-2xl bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 active:scale-95 transition-all"
                >
                  <Delete className="w-5 h-5" />
                </button>
              )
            }
            return (
              <button
                key={key}
                onClick={() => pressKey(key)}
                className="h-16 rounded-2xl bg-gray-700 text-white text-xl font-medium hover:bg-gray-600 active:scale-95 transition-all"
              >
                {key}
              </button>
            )
          })}
        </div>
        <div className="text-center">
          <a href="/login" className="text-gray-500 hover:text-gray-300 text-sm flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Owner login
          </a>
        </div>
      </div>
    </div>
  )
}
'@ | Set-Content -Path "app/(auth)/pin/page.tsx" -Encoding UTF8

# app/(dashboard)/layout.tsx
New-Item -ItemType Directory -Force -Path "app/(dashboard)" | Out-Null
@'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let { data: shop } = await supabase
    .from('shops')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!shop) {
    const { data: newShop } = await supabase
      .from('shops')
      .insert({ owner_id: user.id, name: 'My Store' })
      .select()
      .single()
    shop = newShop
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar shop={shop} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
'@ | Set-Content -Path "app/(dashboard)/layout.tsx" -Encoding UTF8

# components/shared/Sidebar.tsx
New-Item -ItemType Directory -Force -Path "components/shared" | Out-Null
@'
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog,
  BarChart2, Settings, LogOut, Monitor
} from 'lucide-react'
import { toast } from 'sonner'

const navItems = [
  { label: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard },
  { label: 'POS',        href: '/pos',         icon: ShoppingCart },
  { label: 'Items',      href: '/items',       icon: Package },
  { label: 'Inventory',  href: '/inventory',   icon: Package },
  { label: 'Customers',  href: '/customers',   icon: Users },
  { label: 'Employees',  href: '/employees',   icon: UserCog },
  { label: 'Reports',    href: '/reports',     icon: BarChart2 },
  { label: 'Settings',   href: '/settings',    icon: Settings },
]

export default function Sidebar({ shop }: { shop: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

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
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {shop?.kds_enabled && (
        <div className="px-3 pb-2">
          <Link
            href="/kds"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <Monitor className="w-4 h-4" />
            Kitchen Display
          </Link>
        </div>
      )}

      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
'@ | Set-Content -Path "components/shared/Sidebar.tsx" -Encoding UTF8

# app/(dashboard)/dashboard/page.tsx
New-Item -ItemType Directory -Force -Path "app/(dashboard)/dashboard" | Out-Null
@'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { ShoppingCart, Users, Package, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('*')
    .single()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayReceipts } = await supabase
    .from('receipts')
    .select('total')
    .eq('status', 'completed')
    .gte('created_at', today.toISOString())

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{shop?.name} - overview</p>
      </div>

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
        </div>
      </div>
    </div>
  )
}
'@ | Set-Content -Path "app/(dashboard)/dashboard/page.tsx" -Encoding UTF8

# app/(dashboard)/settings/page.tsx
New-Item -ItemType Directory -Force -Path "app/(dashboard)/settings" | Out-Null
@'
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Store, Save } from 'lucide-react'

export default function SettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [shop, setShop] = useState<any>(null)

  useEffect(() => {
    supabase.from('shops').select('*').single().then(({ data }) => {
      if (data) setShop(data)
    })
  }, [])

  function handleChange(field: string, value: any) {
    setShop((prev: any) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setLoading(true)
    const { error } = await supabase
      .from('shops')
      .update({
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        currency: shop.currency,
        currency_symbol: shop.currency_symbol,
        timezone: shop.timezone,
        receipt_header: shop.receipt_header,
        receipt_footer: shop.receipt_footer,
        loyalty_enabled: shop.loyalty_enabled,
        kds_enabled: shop.kds_enabled,
        printer_enabled: shop.printer_enabled,
        tax_inclusive: shop.tax_inclusive,
        points_per_dollar: shop.points_per_dollar,
        points_redemption_rate: shop.points_redemption_rate,
      })
      .eq('id', shop.id)

    if (error) {
      toast.error('Failed to save settings')
    } else {
      toast.success('Settings saved')
    }
    setLoading(false)
  }

  if (!shop) return <div className="p-6 text-gray-500">Loading...</div>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your store details</p>
        </div>
        <Button onClick={handleSave} disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="w-4 h-4" /> Store details
          </CardTitle>
          <CardDescription>This appears on your receipts and reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Store name</Label>
            <Input value={shop.name || ''} onChange={e => handleChange('name', e.target.value)} placeholder="My Store" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={shop.address || ''} onChange={e => handleChange('address', e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={shop.phone || ''} onChange={e => handleChange('phone', e.target.value)} placeholder="+1 234 567 8900" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={shop.email || ''} onChange={e => handleChange('email', e.target.value)} placeholder="store@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Currency code</Label>
              <Input value={shop.currency || ''} onChange={e => handleChange('currency', e.target.value)} placeholder="USD" maxLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency symbol</Label>
              <Input value={shop.currency_symbol || ''} onChange={e => handleChange('currency_symbol', e.target.value)} placeholder="$" maxLength={3} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { field: 'loyalty_enabled', label: 'Customer loyalty points', desc: 'Earn and redeem points on purchases' },
            { field: 'kds_enabled', label: 'Kitchen Display System', desc: 'Show orders on kitchen screen' },
            { field: 'printer_enabled', label: 'Receipt printer', desc: 'Print physical receipts at checkout' },
            { field: 'tax_inclusive', label: 'Tax-inclusive pricing', desc: 'Prices already include tax' },
          ].map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <Switch
                checked={shop[field] ?? false}
                onCheckedChange={v => handleChange(field, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
'@ | Set-Content -Path "app/(dashboard)/settings/page.tsx" -Encoding UTF8

# app/api/ping/route.ts
New-Item -ItemType Directory -Force -Path "app/api/ping" | Out-Null
@'
export async function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() })
}
'@ | Set-Content -Path "app/api/ping/route.ts" -Encoding UTF8

Write-Host "All files created successfully!" -ForegroundColor Green
Write-Host "Next: open .env.local and add your Supabase URL and keys" -ForegroundColor Yellow
