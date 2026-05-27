'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Clock, Timer, Ticket, Printer, UtensilsCrossed } from 'lucide-react'

const FEATURES = [
  {
    key: 'feature_shifts',
    label: 'Shifts',
    desc: 'Track cash that goes in and out of your drawer.',
    icon: Clock,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    key: 'feature_timeclock',
    label: 'Time Clock',
    desc: "Track employees' clock in/out time and calculate their total work hours.",
    icon: Timer,
    color: 'bg-green-100 text-green-600',
  },
  {
    key: 'feature_open_tickets',
    label: 'Open Tickets',
    desc: 'Allow to save and edit orders before completing a payment.',
    icon: Ticket,
    color: 'bg-purple-100 text-purple-600',
  },
  {
    key: 'feature_kitchen_printers',
    label: 'Kitchen Printers',
    desc: 'Send orders to kitchen printer or display.',
    icon: Printer,
    color: 'bg-orange-100 text-orange-600',
  },
  {
    key: 'feature_dining_options',
    label: 'Dining Options',
    desc: 'Mark orders as dine in, takeout or for delivery.',
    icon: UtensilsCrossed,
    color: 'bg-teal-100 text-teal-600',
  },
]

export default function FeaturesPage({ shop: shopProp, onShopUpdate }: { shop?: any; onShopUpdate?: (s: any) => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState<string | null>(null)
  const [shop, setShop] = useState<any>(shopProp ?? null)

  // When rendered as a standalone page (no props), fetch shop data independently
  useEffect(() => {
    if (!shopProp) {
      supabase.from('shops').select('*').single().then(({ data }) => {
        if (data) setShop(data)
      })
    }
  }, [shopProp])

  // Keep in sync if parent passes updated shop prop
  useEffect(() => {
    if (shopProp) setShop(shopProp)
  }, [shopProp])

  async function toggle(key: string, val: boolean) {
    if (!shop) return
    setSaving(key)
    const newShop = { ...shop, [key]: val }
    setShop(newShop)
    onShopUpdate?.(newShop)
    const { error } = await supabase.from('shops').update({ [key]: val }).eq('id', shop.id)
    if (error) {
      toast.error('Failed to save')
      const reverted = { ...newShop, [key]: !val }
      setShop(reverted)
      onShopUpdate?.(reverted)
    } else {
      toast.success(`${FEATURES.find(f => f.key === key)?.label} ${val ? 'enabled' : 'disabled'}`)
    }
    setSaving(null)
  }

  if (!shop) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8">
        Loading...
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Features</h2>
        <p className="text-sm text-gray-500 mt-1">Toggle features on or off. Enabled features will appear in the Settings sidebar.</p>
      </div>

      <div className="space-y-3">
        {FEATURES.map(({ key, label, desc, icon: Icon, color }) => (
          <div
            key={key}
            className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <Switch
              checked={shop[key] ?? false}
              onCheckedChange={v => toggle(key, v)}
              disabled={saving === key}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
