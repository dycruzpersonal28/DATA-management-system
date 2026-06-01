'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Save, Store, MapPin, Phone, Mail, DollarSign, Clock } from 'lucide-react'

const CURRENCIES = [
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah' },
]

const TIMEZONES = [
  { value: 'Asia/Manila',       label: 'Asia/Manila (PHT, UTC+8)' },
  { value: 'Asia/Singapore',    label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala Lumpur (MYT, UTC+8)' },
  { value: 'Asia/Jakarta',      label: 'Asia/Jakarta (WIB, UTC+7)' },
  { value: 'Asia/Bangkok',      label: 'Asia/Bangkok (ICT, UTC+7)' },
  { value: 'Asia/Tokyo',        label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Asia/Dubai',        label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Europe/London',     label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York',  label: 'America/New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST/PDT)' },
  { value: 'Australia/Sydney',  label: 'Australia/Sydney (AEST, UTC+10)' },
]

export default function StoreSettingsPage({
  shop: shopProp,
  onShopUpdate,
}: {
  shop?: any
  onShopUpdate?: (s: any) => void
}) {
  const [shop, setShop] = useState<any>(shopProp ?? null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name:            shopProp?.name            ?? '',
    address:         shopProp?.address         ?? '',
    phone:           shopProp?.phone           ?? '',
    email:           shopProp?.email           ?? '',
    currency:        shopProp?.currency        ?? 'PHP',
    currency_symbol: shopProp?.currency_symbol ?? '₱',
    timezone:        shopProp?.timezone        ?? 'Asia/Manila',
  })

  // Standalone fetch if not passed as prop
  useEffect(() => {
    if (!shopProp) {
      fetch('/api/shop')
        .then(r => r.json())
        .then(({ shop: data }) => {
          if (data) {
            setShop(data)
            setForm({
              name:            data.name            ?? '',
              address:         data.address         ?? '',
              phone:           data.phone           ?? '',
              email:           data.email           ?? '',
              currency:        data.currency        ?? 'PHP',
              currency_symbol: data.currency_symbol ?? '₱',
              timezone:        data.timezone        ?? 'Asia/Manila',
            })
          }
        })
    }
  }, [shopProp])

  // Sync if parent updates shop prop
  useEffect(() => {
    if (shopProp) setShop(shopProp)
  }, [shopProp])

  function handleCurrencyChange(code: string) {
    const match = CURRENCIES.find(c => c.code === code)
    setForm(p => ({
      ...p,
      currency:        code,
      currency_symbol: match?.symbol ?? p.currency_symbol,
    }))
  }

  async function handleSave() {
    if (!shop?.id) return
    if (!form.name.trim()) { toast.error('Store name is required'); return }
    setSaving(true)
    const res = await fetch('/api/shop', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const { shop: updated, error: errMsg } = await res.json()
    if (!res.ok) { toast.error('Failed to save: ' + errMsg); setSaving(false); return }
    onShopUpdate?.(updated ?? shop)
    setShop(updated ?? shop)
    toast.success('Store settings saved')
    setSaving(false)
  }

  if (!shop) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8">
        Loading…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Store Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Basic info, contact details, and regional settings.</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="space-y-5">

        {/* Store Info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Store Information</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Store Name <span className="text-red-400">*</span></label>
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. My Restaurant"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              <MapPin className="w-3 h-3 inline mr-1 text-gray-400" />Address
            </label>
            <textarea
              rows={2}
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="123 Main Street, City, Province"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-300"
            />
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Contact Details</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <Phone className="w-3 h-3 inline mr-1 text-gray-400" />Phone
              </label>
              <Input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="(02) 123-4567"
                type="tel"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <Mail className="w-3 h-3 inline mr-1 text-gray-400" />Email
              </label>
              <Input
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="store@example.com"
                type="email"
              />
            </div>
          </div>
        </div>

        {/* Currency */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Currency</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={e => handleCurrencyChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Symbol</label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.currency_symbol}
                  onChange={e => setForm(p => ({ ...p, currency_symbol: e.target.value }))}
                  placeholder="₱"
                  className="w-24"
                  maxLength={4}
                />
                <span className="text-xs text-gray-400">Override if needed</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Preview:</span>
            <span className="text-sm font-semibold text-gray-800">
              {form.currency_symbol}1,234.00
            </span>
            <span className="text-xs text-gray-400 ml-1">({form.currency})</span>
          </div>
        </div>

        {/* Timezone */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Timezone</h3>
          </div>
          <select
            value={form.timezone}
            onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-2">Used for clock-in/out date calculations, late &amp; overtime tracking, and report grouping. All employees use this timezone regardless of their device location.</p>
        </div>

      </div>
    </div>
  )
}
