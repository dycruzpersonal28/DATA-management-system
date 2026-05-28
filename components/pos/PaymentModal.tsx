'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { Button } from '@/components/ui/button'
import { X, Check, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useShop } from '@/lib/hooks/useShop'

interface Props {
  total: number
  onClose: () => void
}

// ── ESC/POS helpers (works for network + browser print fallback) ─────────────
function buildReceiptText(receipt: any, items: any[], shop: any, currencySymbol: string, change: number, paymentName: string): string {
  const line = '--------------------------------'
  const center = (s: string) => s.padStart(Math.floor((32 + s.length) / 2)).padEnd(32)
  const row = (left: string, right: string) => {
    const space = 32 - left.length - right.length
    return left + ' '.repeat(Math.max(1, space)) + right
  }

  const lines: string[] = [
    center(shop?.name || 'Receipt'),
    shop?.address ? center(shop.address) : '',
    shop?.phone ? center(shop.phone) : '',
    '',
    center(`Receipt #${receipt.receipt_number}`),
    center(new Date(receipt.created_at).toLocaleString()),
    line,
  ]

  for (const item of items) {
    lines.push(row(`${item.quantity}x ${item.item_name}`, `${currencySymbol}${item.line_total.toFixed(2)}`))
    if (item.addons && item.addons.length > 0) {
      for (const a of item.addons) {
        lines.push(`   + ${a.name}${a.quantity > 1 ? ` x${a.quantity}` : ''}  ${currencySymbol}${(a.price * a.quantity).toFixed(2)}`)
      }
    }
    if (item.note) lines.push(`   📝 ${item.note}`)
  }

  lines.push(
    line,
    row('Subtotal', `${currencySymbol}${receipt.subtotal.toFixed(2)}`),
    receipt.discount_amount > 0 ? row('Discount', `-${currencySymbol}${receipt.discount_amount.toFixed(2)}`) : '',
    row('TOTAL', `${currencySymbol}${receipt.total.toFixed(2)}`),
    row('Payment', paymentName),
    change > 0 ? row('Change', `${currencySymbol}${change.toFixed(2)}`) : '',
    line,
    shop?.receipt_footer ? center(shop.receipt_footer) : center('Thank you!'),
    '',
    '',
  )

  return lines.filter(l => l !== '').join('\n')
}

function buildKDSText(receipt: any, items: any[]): string {
  const line = '================================'
  const lines: string[] = [
    `ORDER #${receipt.receipt_number}`,
    new Date(receipt.created_at).toLocaleTimeString(),
    line,
  ]

  for (const item of items) {
    lines.push(`${item.quantity}x ${item.item_name}`)
    if (item.addons && item.addons.length > 0) {
      for (const a of item.addons) {
        lines.push(`  + ${a.name}${a.quantity > 1 ? ` x${a.quantity}` : ''}`)
      }
    }
    if (item.ingredients && item.ingredients.length > 0) {
      for (const ing of item.ingredients) {
        lines.push(`    [${ing.name} x${ing.quantity}]`)
      }
    }
    if (item.note) lines.push(`  >> NOTE: ${item.note}`)
    lines.push('')
  }

  lines.push(line, '', '')
  return lines.join('\n')
}

async function sendToNetworkPrinter(ip: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, text }),
    })
    return res.ok
  } catch {
    return false
  }
}

function printViaWindow(text: string, title: string) {
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 12px; white-space: pre; margin: 16px; }
      @media print { @page { margin: 0; } body { margin: 8mm; } }
    </style></head>
    <body>${text.replace(/</g, '&lt;')}</body></html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

export default function PaymentModal({ total, onClose }: Props) {
  const supabase = createClient()
  const { items, customerId, discountAmount, clearCart, subtotal } = useCart()
  const [paymentTypes, setPaymentTypes] = useState<any[]>([])
  const [selectedType, setSelectedType] = useState<any>(null)
  const [cashInput, setCashInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [change, setChange] = useState(0)
  const [shop, setShop] = useState<any>(null)
  const { shop: shopFromHook, currencySymbol } = useShop()

  useEffect(() => {
    if (shopFromHook) setShop(shopFromHook)
  }, [shopFromHook])

  useEffect(() => {
    supabase
      .from('payment_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const types = data || []
        if (types.length === 0) {
          const defaults = [{ id: 'cash', name: 'Cash' }, { id: 'card', name: 'Card' }]
          setPaymentTypes(defaults)
          setSelectedType(defaults[0])
        } else {
          setPaymentTypes(types)
          setSelectedType(types[0])
        }
      })
  }, [])

  const isCash = selectedType?.name?.toLowerCase() === 'cash'
  const cashAmount = parseFloat(cashInput) || 0
  const changeAmount = isCash ? Math.max(0, cashAmount - total) : 0

  async function handleCharge() {
    if (isCash && cashAmount < total) { toast.error('Cash amount is less than total'); return }
    setLoading(true)

    try {
      if (!shop) throw new Error('No shop found')

      // Receipt number
      const { count } = await supabase
        .from('receipts')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shop.id)

      const receiptNumber = `R-${String((count || 0) + 1).padStart(6, '0')}`

      // Employee
      let employeeId = null
      try {
        const emp = JSON.parse(localStorage.getItem('pos_employee') || 'null')
        employeeId = emp?.id || null
      } catch {}

      // Shift
      let activeShiftId = null
      try {
        const shift = JSON.parse(localStorage.getItem('pos_active_shift') || 'null')
        activeShiftId = shift?.id || null
      } catch {}

      // App user / fallback shift lookup
      let appUserId: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: appUser } = await supabase
            .from('app_users').select('id').eq('auth_user_id', user.id).single()
          appUserId = appUser?.id || null
        }
      } catch {}

      if (!activeShiftId && appUserId) {
        try {
          const { data: openShift } = await supabase
            .from('shifts')
            .select('id')
            .eq('app_user_id', appUserId)
            .eq('status', 'open')
            .order('clock_in', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (openShift) activeShiftId = openShift.id
        } catch {}
      }

      const sub = subtotal()

      // ── Call the API route — handles receipt, stock, COGS, financial entries ──
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id,
          employee_id: employeeId,
          customer_id: customerId || null,
          receipt_number: receiptNumber,
          subtotal: sub,
          discount_amount: discountAmount,
          tax_amount: 0,
          total,
          payment_type_id: selectedType?.id !== 'cash' && selectedType?.id !== 'card'
            ? selectedType.id
            : null,
          amount_tendered: isCash ? cashAmount : total,
          change_amount: changeAmount,
          loyalty_points_earned: Math.floor(total),
          loyalty_points_redeemed: 0,
          shift_id: activeShiftId,
          status: 'completed',
          items,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to process payment')
      }

      const { receipt, receiptItems } = await res.json()

      // ── Printing ─────────────────────────────────────────────────────────────
      const receiptText = buildReceiptText(receipt, receiptItems, shop, currencySymbol, changeAmount, selectedType?.name || '')
      const kdsText = buildKDSText(receipt, receiptItems)

      if (shop.printer_enabled) {
        if (shop.receipt_printer_type === 'network' && shop.receipt_printer_address) {
          const ok = await sendToNetworkPrinter(shop.receipt_printer_address, receiptText)
          if (!ok) printViaWindow(receiptText, `Receipt ${receiptNumber}`)
        } else if (shop.receipt_printer_type === 'bluetooth') {
          try {
            const device = await (navigator as any).bluetooth.requestDevice({
              filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
            })
            const server = await device.gatt.connect()
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
            const encoder = new TextEncoder()
            await characteristic.writeValue(encoder.encode(receiptText))
          } catch {
            printViaWindow(receiptText, `Receipt ${receiptNumber}`)
          }
        } else {
          printViaWindow(receiptText, `Receipt ${receiptNumber}`)
        }
      }

      if (shop.kds_enabled) {
        if (shop.kds_printer_type === 'network' && shop.kds_printer_address) {
          const ok = await sendToNetworkPrinter(shop.kds_printer_address, kdsText)
          if (!ok) printViaWindow(kdsText, `KDS ${receiptNumber}`)
        } else if (shop.kds_printer_type === 'browser') {
          printViaWindow(kdsText, `KDS ${receiptNumber}`)
        }
      }

      setChange(changeAmount)
      setDone(true)
      clearCart()
    } catch (err: any) {
      toast.error(err.message || 'Failed to process payment')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Payment complete!</h2>
          {isCash && change > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-500">Change due</p>
              <p className="text-3xl font-bold text-gray-900">{currencySymbol}{change.toFixed(2)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => {
              const receiptText = `Receipt printed`
              printViaWindow(receiptText, 'Reprint')
            }}>
              <Printer className="w-4 h-4 mr-1.5" />Reprint
            </Button>
            <Button className="flex-1" onClick={onClose}>New order</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-500">Total due</p>
            <p className="text-4xl font-bold text-gray-900">{currencySymbol}{total.toFixed(2)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {paymentTypes.map(pt => (
              <button key={pt.id} onClick={() => setSelectedType(pt)}
                className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                  selectedType?.id === pt.id
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {pt.name}
              </button>
            ))}
          </div>

          {isCash && (
            <div className="space-y-2">
              <label className="text-sm text-gray-500">Cash tendered</label>
              <input type="number" value={cashInput} onChange={e => setCashInput(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus />
              <div className="grid grid-cols-4 gap-1.5">
                {[total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20]
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .map(amount => (
                    <button key={amount} onClick={() => setCashInput(amount.toFixed(2))}
                      className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700">
                      {currencySymbol}{amount.toFixed(0)}
                    </button>
                  ))}
              </div>
              {cashAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Change</span>
                  <span className="font-semibold text-green-600">{currencySymbol}{changeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleCharge}
            disabled={loading || (isCash && cashAmount < total)}>
            {loading ? 'Processing...' : `Confirm ${selectedType?.name || ''} Payment`}
          </Button>
        </div>
      </div>
    </div>
  )
}
