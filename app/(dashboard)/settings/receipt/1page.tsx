'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Upload, X, Save, Eye } from 'lucide-react'

export default function ReceiptPage({ shop: shopProp, onShopUpdate }: { shop?: any; onShopUpdate?: (s: any) => void }) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [shop, setShop] = useState<any>(shopProp ?? null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)

  // When rendered as a standalone page (no props), fetch shop data independently
  useEffect(() => {
    if (!shopProp) {
      supabase.from('shops').select('*').single().then(({ data }) => {
        if (data) {
          setShop(data)
          setForm({
            receipt_header: data.receipt_header || '',
            receipt_footer: data.receipt_footer || '',
            logo_url: data.logo_url || '',
          })
        }
      })
    }
  }, [shopProp])

  // Keep in sync if parent passes updated shop prop
  useEffect(() => {
    if (shopProp) setShop(shopProp)
  }, [shopProp])

  const [form, setForm] = useState({
    receipt_header: shopProp?.receipt_header || '',
    receipt_footer: shopProp?.receipt_footer || '',
    logo_url: shopProp?.logo_url || '',
  })

  if (!shop) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8">
        Loading...
      </div>
    )
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `logos/${shop.id}.${ext}`
    const { error } = await supabase.storage.from('receipt-assets').upload(path, file, { upsert: true })
    if (error) { toast.error('Upload failed'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('receipt-assets').getPublicUrl(path)
    setForm(p => ({ ...p, logo_url: publicUrl + '?t=' + Date.now() }))
    toast.success('Logo uploaded')
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    const { data, error } = await supabase.from('shops').update({
      receipt_header: form.receipt_header,
      receipt_footer: form.receipt_footer,
      logo_url: form.logo_url,
    }).eq('id', shop.id).select().single()
    if (error) { toast.error('Failed to save'); setSaving(false); return }
    onShopUpdate?.(data)
    setShop(data)
    toast.success('Receipt settings saved')
    setSaving(false)
  }

  async function removeLogo() {
    setForm(p => ({ ...p, logo_url: '' }))
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Receipt</h2>
          <p className="text-sm text-gray-500 mt-1">Customize your receipt layout and branding.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(p => !p)}>
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            {preview ? 'Hide' : 'Preview'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save
          </Button>
        </div>
      </div>

      <div className={`flex gap-6 ${preview ? 'flex-row' : 'flex-col'}`}>
        {/* Form */}
        <div className="flex-1 space-y-5">
          {/* Logo */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Logo</h3>
            {form.logo_url ? (
              <div className="flex items-center gap-4">
                <img src={form.logo_url} alt="Logo" className="h-16 w-auto object-contain rounded-lg border border-gray-200 p-1" />
                <div>
                  <p className="text-xs text-gray-500 mb-2">Current logo</p>
                  <Button variant="outline" size="sm" onClick={removeLogo}>
                    <X className="w-3.5 h-3.5 mr-1.5" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm">{uploading ? 'Uploading…' : 'Click to upload logo'}</span>
                <span className="text-xs">PNG, JPG up to 2MB</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>

          {/* Header */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Header Text</h3>
            <p className="text-xs text-gray-400 mb-3">Appears at the top of the receipt, below the logo.</p>
            <textarea
              rows={3}
              value={form.receipt_header}
              onChange={e => setForm(p => ({ ...p, receipt_header: e.target.value }))}
              placeholder={`${shop?.name || 'Your Store Name'}\n123 Main Street\nTel: (02) 123-4567`}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-300"
            />
          </div>

          {/* Footer */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Footer Text</h3>
            <p className="text-xs text-gray-400 mb-3">Appears at the bottom of the receipt.</p>
            <textarea
              rows={3}
              value={form.receipt_footer}
              onChange={e => setForm(p => ({ ...p, receipt_footer: e.target.value }))}
              placeholder="Thank you for dining with us! Visit again soon."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-300"
            />
          </div>

          {/* Store info note */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-600 font-medium">Store name, address, and contact info is pulled automatically from your shop settings.</p>
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="w-64 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
            <div className="bg-white border border-gray-200 rounded-xl p-4 font-mono text-xs text-gray-700 shadow-sm" style={{ minHeight: 320 }}>
              {/* Logo preview */}
              {form.logo_url && (
                <div className="flex justify-center mb-3">
                  <img src={form.logo_url} alt="Logo" className="h-10 w-auto object-contain" />
                </div>
              )}
              {/* Header */}
              {form.receipt_header ? (
                <div className="text-center mb-3 whitespace-pre-line leading-relaxed">{form.receipt_header}</div>
              ) : (
                <div className="text-center mb-3 text-gray-300">{shop?.name}</div>
              )}
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="space-y-1 my-2">
                <div className="flex justify-between"><span>Item 1</span><span>100.00</span></div>
                <div className="flex justify-between"><span>Item 2</span><span>50.00</span></div>
              </div>
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="flex justify-between font-bold my-2"><span>TOTAL</span><span>150.00</span></div>
              <div className="border-t border-dashed border-gray-300 my-2" />
              {/* Footer */}
              {form.receipt_footer ? (
                <div className="text-center mt-3 whitespace-pre-line leading-relaxed text-gray-500">{form.receipt_footer}</div>
              ) : (
                <div className="text-center mt-3 text-gray-300">Footer text</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
