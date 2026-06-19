'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Save, Store, MapPin, Phone, Mail, DollarSign, Clock, Printer, Network, Bluetooth, ScanLine } from 'lucide-react'
import { requestBlePrinter } from '@/lib/printing/blePrinter'

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

// ── Bluetooth scanner ─────────────────────────────────────────────────────────
// Same single-pick flow used on the Printer Groups page: native device
// picker in the Android app, Web Bluetooth fallback for desktop testing.
// Works with any generic ESC/POS BLE thermal printer, not one brand.
async function scanAndPairBluetooth(): Promise<string | null> {
  try {
    const device = await requestBlePrinter()
    if (!device) return null
    toast.success(`Paired: ${device.name}`)
    return device.deviceId
  } catch (err: any) {
    toast.error(err?.message || 'Bluetooth pairing failed')
    return null
  }
}

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
    receipt_printer_type:    shopProp?.receipt_printer_type    ?? 'none',
    receipt_printer_address: shopProp?.receipt_printer_address ?? '',
  })
  const [btScanning, setBtScanning] = useState(false)

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
              receipt_printer_type:    data.receipt_printer_type    ?? 'none',
              receipt_printer_address: data.receipt_printer_address ?? '',
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

  async function handleBtScan() {
    setBtScanning(true)
    const deviceId = await scanAndPairBluetooth()
    if (deviceId) {
      setForm(p => ({ ...p, receipt_printer_address: deviceId }))
    }
    setBtScanning(false)
  }

  async function handleSave() {
    if (!shop?.id) return
    if (!form.name.trim()) { toast.error('Store name is required'); return }
    if (form.receipt_printer_type !== 'none' && !form.receipt_printer_address.trim()) {
      toast.error('Set a receipt printer address, or switch connection type to None')
      return
    }
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

        {/* Receipt Printer */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Printer className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Receipt Printer</h3>
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Prints the customer-facing receipt at checkout. Works with any generic Bluetooth ESC/POS thermal printer.
          </p>

          <div className="flex gap-2">
            {[
              { v: 'none',      label: 'None' },
              { v: 'network',   label: 'Network (LAN)', icon: Network },
              { v: 'bluetooth', label: 'Bluetooth',     icon: Bluetooth },
            ].map(opt => {
              const Icon = (opt as any).icon
              const active = form.receipt_printer_type === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, receipt_printer_type: opt.v }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {opt.label}
                </button>
              )
            })}
          </div>

          {form.receipt_printer_type === 'network' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">IP Address / Port</label>
              <Input
                value={form.receipt_printer_address}
                onChange={e => setForm(p => ({ ...p, receipt_printer_address: e.target.value }))}
                placeholder="e.g. 192.168.1.50:9100"
              />
            </div>
          )}

          {form.receipt_printer_type === 'bluetooth' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Paired Device</label>
              <div className="flex gap-2">
                <Input
                  value={form.receipt_printer_address}
                  readOnly
                  placeholder="No device paired yet"
                  className="bg-gray-50 text-gray-500 text-sm"
                />
                <button
                  type="button"
                  onClick={handleBtScan}
                  disabled={btScanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex-shrink-0"
                >
                  {btScanning ? (
                    <span className="animate-pulse">Scanning…</span>
                  ) : (
                    <><ScanLine className="w-3.5 h-3.5" /> Scan</>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Make sure your printer is powered on and in pairing mode</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
