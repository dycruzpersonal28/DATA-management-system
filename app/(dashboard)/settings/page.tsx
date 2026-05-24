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
