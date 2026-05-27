'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Zap, CreditCard, Heart, Percent, Receipt, Printer, UtensilsCrossed,
  Monitor, Settings, ChevronRight
} from 'lucide-react'

// Sub-pages
import FeaturesPage from './features/page'
import PaymentTypesPage from './payment-types/page'
import LoyaltyPage from './loyalty/page'
import TaxesDiscountsPage from './taxes-discounts/page'
import ReceiptPage from './receipt/page'
import KitchenPrintersPage from './kitchen-printers/page'
import DiningOptionsPage from './dining-options/page'
import POSSettingsPage from './pos-settings/page'

const NAV_ITEMS = [
  {
    id: 'features',
    label: 'Features',
    desc: 'Toggle available features on and off',
    icon: Zap,
    color: 'bg-violet-100 text-violet-600',
  },
  {
    id: 'payment-types',
    label: 'Payment Types',
    desc: 'Create payment methods for checkout',
    icon: CreditCard,
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    id: 'loyalty',
    label: 'Loyalty',
    desc: 'Customer loyalty points program',
    icon: Heart,
    color: 'bg-pink-100 text-pink-600',
  },
  {
    id: 'taxes-discounts',
    label: 'Taxes & Discounts',
    desc: 'Manage tax rates and discount options',
    icon: Percent,
    color: 'bg-amber-100 text-amber-600',
  },
  {
    id: 'receipt',
    label: 'Receipt',
    desc: 'Customize receipt layout and branding',
    icon: Receipt,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'kitchen-printers',
    label: 'Kitchen Printers',
    desc: 'Set up printers and printer groups',
    icon: Printer,
    color: 'bg-orange-100 text-orange-600',
    featureGated: 'feature_kitchen_printers',
  },
  {
    id: 'dining-options',
    label: 'Dining Options',
    desc: 'Dine in, takeout, delivery options',
    icon: UtensilsCrossed,
    color: 'bg-teal-100 text-teal-600',
    featureGated: 'feature_dining_options',
  },
  {
    id: 'pos-settings',
    label: 'Users & POS Settings',
    desc: 'POS terminals, permissions, printer control',
    icon: Monitor,
    color: 'bg-indigo-100 text-indigo-600',
  },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [active, setActive] = useState('features')
  const [shop, setShop] = useState<any>(null)

  useEffect(() => {
    supabase.from('shops').select('*').single().then(({ data }) => {
      if (data) setShop(data)
    })
  }, [])

  const visibleNav = NAV_ITEMS.filter(item => {
    if (!item.featureGated) return true
    return shop?.[item.featureGated] === true
  })

  const ActivePage = () => {
    switch (active) {
      case 'features': return <FeaturesPage shop={shop} onShopUpdate={setShop} />
      case 'payment-types': return <PaymentTypesPage />
      case 'loyalty': return <LoyaltyPage />
      case 'taxes-discounts': return <TaxesDiscountsPage />
      case 'receipt': return <ReceiptPage shop={shop} onShopUpdate={setShop} />
      case 'kitchen-printers': return <KitchenPrintersPage />
      case 'dining-options': return <DiningOptionsPage />
      case 'pos-settings': return <POSSettingsPage />
      default: return null
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <h1 className="text-base font-semibold text-gray-900">Settings</h1>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleNav.map(item => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {item.label}
                  </p>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {shop ? <ActivePage /> : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>
        )}
      </div>
    </div>
  )
}
