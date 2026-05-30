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
    if (item.note) lines.push(`   >> ${item.note}`)
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
    '', '',
  )
  return lines.filter(l => l !== '').join('\n')
}

function buildKitchenTicket(
  receipt: any,
  items: Array<{
    item_name: string
    quantity: number
    note?: string
    unit_price?: number
    line_total?: number
    ingredients: Array<{ name: string; quantity: number }>
  }>,
  printerName: string,
  paperWidth: number,
  showAmounts: boolean,
  showIngredients: boolean,
  currencySymbol: string,
): Uint8Array {
  const ESC = 0x1b
  const GS  = 0x1d
  const charWidth = paperWidth >= 80 ? 48 : 32
  const div = '='.repeat(charWidth)
  const cmd: number[] = []

  cmd.push(ESC, 0x40)
  cmd.push(ESC, 0x21, 0x30)
  const header = `ORDER #${receipt.receipt_number}`
  for (const c of header) cmd.push(c.charCodeAt(0))
  cmd.push(0x0a)

  cmd.push(ESC, 0x21, 0x00)
  const time = new Date(receipt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  for (const c of time) cmd.push(c.charCodeAt(0))
  cmd.push(0x0a)

  if (printerName) {
    for (const c of `[${printerName.toUpperCase()}]`) cmd.push(c.charCodeAt(0))
    cmd.push(0x0a)
  }

  for (const c of div) cmd.push(c.charCodeAt(0))
  cmd.push(0x0a)

  for (const item of items) {
    cmd.push(ESC, 0x45, 0x01)

    let itemLine: string
    if (showAmounts && item.line_total !== undefined) {
      const left = `${item.quantity}x ${item.item_name}`
      const right = `${currencySymbol}${Number(item.line_total).toFixed(2)}`
      const spaces = Math.max(1, charWidth - left.length - right.length)
      itemLine = left + ' '.repeat(spaces) + right
    } else {
      itemLine = `${item.quantity}x ${item.item_name}`
    }

    if (itemLine.length > charWidth) itemLine = itemLine.substring(0, charWidth)
    for (const c of itemLine) cmd.push(c.charCodeAt(0))
    cmd.push(0x0a)
    cmd.push(ESC, 0x45, 0x00)

    if (showIngredients && item.ingredients && item.ingredients.length > 0) {
      for (const ing of item.ingredients) {
        const ingLine = `  - ${ing.name} (x${ing.quantity})`
        for (const c of ingLine) cmd.push(c.charCodeAt(0))
        cmd.push(0x0a)
      }
    }

    if (item.note) {
      const noteLine = `  >> ${item.note}`
      for (const c of noteLine) cmd.push(c.charCodeAt(0))
      cmd.push(0x0a)
    }

    cmd.push(0x0a)
  }

  for (const c of div) cmd.push(c.charCodeAt(0))
  cmd.push(0x0a, 0x0a, 0x0a)
  cmd.push(GS, 0x56, 0x42, 0x00)

  return new Uint8Array(cmd)
}

const BT_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb',
]
const BT_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
]

async function sendToBluetoothPrinter(deviceName: string, data: Uint8Array): Promise<boolean> {
  try {
    const bt = (navigator as any).bluetooth
    if (!bt) return false
    const requestOpts: any = deviceName
      ? { filters: [{ name: deviceName }], optionalServices: BT_SERVICE_UUIDS }
      : { acceptAllDevices: true, optionalServices: BT_SERVICE_UUIDS }
    const device = await bt.requestDevice(requestOpts)
    const server = await device.gatt.connect()
    let characteristic = null
    for (const svcUuid of BT_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(svcUuid)
        for (const charUuid of BT_CHAR_UUIDS) {
          try { characteristic = await service.getCharacteristic(charUuid); break } catch {}
        }
        if (characteristic) break
      } catch {}
    }
    if (!characteristic) { device.gatt.disconnect(); return false }
    const CHUNK = 512
    for (let i = 0; i < data.length; i += CHUNK) {
      await characteristic.writeValue(data.slice(i, i + CHUNK))
    }
    device.gatt.disconnect()
    return true
  } catch (err) {
    console.error('Bluetooth print error:', err)
    return false
  }
}

async function sendToNetworkPrinter(ip: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, text }),
    })
    return res.ok
  } catch { return false }
}

function printViaWindow(text: string, title: string) {
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(`<html><head><title>${title}</title>
    <style>body{font-family:'Courier New',monospace;font-size:12px;white-space:pre;margin:16px;}
    @media print{@page{margin:0;}body{margin:8mm;}}</style></head>
    <body>${text.replace(/</g, '&lt;')}</body></html>`)
  win.document.close(); win.focus(); win.print()
}

async function triggerKitchenPrint(
  supabase: any,
  receipt: any,
  receiptItems: any[],
  shopId: string,
  currencySymbol: string,
): Promise<void> {
  try {
    const [{ data: groups }, { data: pgc }] = await Promise.all([
      supabase.from('printer_groups')
        .select('id, name, printer_type, printer_address, paper_width, show_amounts, show_ingredients')
        .eq('shop_id', shopId)
        .eq('is_active', true),
      supabase.from('printer_group_categories').select('*'),
    ])
    if (!groups || groups.length === 0) return

    const catToPrinter = new Map<string, string>()
    for (const row of (pgc || [])) catToPrinter.set(row.category_id, row.printer_group_id)

    const itemIds = receiptItems.map((ri: any) => ri.item_id).filter(Boolean)
    const { data: ingredientRows } = await supabase
      .from('item_ingredients')
      .select('item_id, quantity, items!item_ingredients_ingredient_id_fkey(name)')
      .in('item_id', itemIds)

    const ingredientsByItem = new Map<string, Array<{ name: string; quantity: number }>>()
    for (const row of (ingredientRows || [])) {
      if (!ingredientsByItem.has(row.item_id)) ingredientsByItem.set(row.item_id, [])
      ingredientsByItem.get(row.item_id)!.push({
        name: (row.items as any)?.name ?? 'Unknown',
        quantity: Number(row.quantity),
      })
    }

    const { data: itemCats } = await supabase
      .from('items').select('id, category_id').in('id', itemIds)
    const itemCatMap = new Map<string, string>()
    for (const row of (itemCats || [])) itemCatMap.set(row.id, row.category_id)

    const printerItems = new Map<string, any[]>()
    for (const ri of receiptItems) {
      const catId = itemCatMap.get(ri.item_id)
      if (!catId) continue
      const pgId = catToPrinter.get(catId)
      if (!pgId) continue
      if (!printerItems.has(pgId)) printerItems.set(pgId, [])
      printerItems.get(pgId)!.push(ri)
    }
    if (printerItems.size === 0) return

    for (const group of groups) {
      const items = printerItems.get(group.id)
      if (!items || items.length === 0) continue

      const paperWidth  = group.paper_width     ?? 57
      const showAmounts = group.show_amounts     ?? false
      const showIngreds = group.show_ingredients ?? true

      const kitchenItems = items.map((ri: any) => ({
        item_name:   ri.item_name,
        quantity:    Number(ri.quantity),
        note:        ri.note || undefined,
        unit_price:  Number(ri.unit_price),
        line_total:  Number(ri.line_total),
        ingredients: ingredientsByItem.get(ri.item_id) || [],
      }))

      if (group.printer_type === 'bluetooth') {
        const data = buildKitchenTicket(receipt, kitchenItems, group.name, paperWidth, showAmounts, showIngreds, currencySymbol)
        const ok = await sendToBluetoothPrinter(group.printer_address || '', data)
        if (!ok) {
          const text = buildFallbackText(receipt, kitchenItems, group.name, showAmounts, showIngreds, currencySymbol)
          printViaWindow(text, `Kitchen - ${group.name}`)
          toast.warning(`${group.name}: Bluetooth failed, opened print window`)
        } else {
          toast.success(`Sent to ${group.name}`)
        }
      } else if (group.printer_type === 'network' || group.printer_type === 'wifi') {
        const text = buildFallbackText(receipt, kitchenItems, group.name, showAmounts, showIngreds, currencySymbol)
        const ok = await sendToNetworkPrinter(group.printer_address, text)
        if (!ok) toast.warning(`${group.name}: Network print failed`)
      }
    }
  } catch (err) {
    console.error('Kitchen print error:', err)
  }
}

function buildFallbackText(
  receipt: any,
  items: any[],
  printerName: string,
  showAmounts: boolean,
  showIngredients: boolean,
  currencySymbol: string,
): string {
  const lines = [
    `ORDER #${receipt.receipt_number}`,
    new Date(receipt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    `[${printerName.toUpperCase()}]`,
    '================================',
  ]
  for (const item of items) {
    const amtPart = showAmounts && item.line_total !== undefined
      ? `  ${currencySymbol}${Number(item.line_total).toFixed(2)}`
      : ''
    lines.push(`${item.quantity}x ${item.item_name}${amtPart}`)
    if (showIngredients && item.ingredients?.length > 0) {
      for (const ing of item.ingredients) lines.push(`  - ${ing.name} (x${ing.quantity})`)
    }
    if (item.note) lines.push(`  >> ${item.note}`)
    lines.push('')
  }
  lines.push('================================', '', '')
  return lines.join('\n')
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
  const [lastReceipt, setLastReceipt] = useState<any>(null)
  const [lastReceiptItems, setLastReceiptItems] = useState<any[]>([])
  const { shop: shopFromHook, currencySymbol } = useShop()

  useEffect(() => { if (shopFromHook) setShop(shopFromHook) }, [shopFromHook])

  useEffect(() => {
    supabase.from('payment_types').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        const types = data || []
        if (types.length === 0) {
          const defaults = [{ id: 'cash', name: 'Cash' }, { id: 'card', name: 'Card' }]
          setPaymentTypes(defaults); setSelectedType(defaults[0])
        } else {
          setPaymentTypes(types); setSelectedType(types[0])
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

      const { count } = await supabase.from('receipts')
        .select('*', { count: 'exact', head: true }).eq('shop_id', shop.id)
      const receiptNumber = `R-${String((count || 0) + 1).padStart(6, '0')}`

      let employeeId = null
      try { const emp = JSON.parse(localStorage.getItem('pos_employee') || 'null'); employeeId = emp?.id || null } catch {}

      let activeShiftId = null
      try { const shift = JSON.parse(localStorage.getItem('pos_active_shift') || 'null'); activeShiftId = shift?.id || null } catch {}

      let appUserId: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_user_id', user.id).single()
          appUserId = appUser?.id || null
        }
      } catch {}

      if (!activeShiftId && appUserId) {
        try {
          const { data: openShift } = await supabase.from('shifts').select('id')
            .eq('app_user_id', appUserId).eq('status', 'open')
            .order('clock_in', { ascending: false }).limit(1).maybeSingle()
          if (openShift) activeShiftId = openShift.id
        } catch {}
      }

      const sub = subtotal()
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id, employee_id: employeeId, customer_id: customerId || null,
          receipt_number: receiptNumber, subtotal: sub, discount_amount: discountAmount,
          tax_amount: 0, total,
          payment_type_id: selectedType?.id !== 'cash' && selectedType?.id !== 'card' ? selectedType.id : null,
          amount_tendered: isCash ? cashAmount : total, change_amount: changeAmount,
          loyalty_points_earned: Math.floor(total), loyalty_points_redeemed: 0,
          shift_id: activeShiftId, status: 'completed', items,
        }),
      })

      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to process payment') }
      const { receipt, receiptItems } = await res.json()

      const receiptText = buildReceiptText(receipt, receiptItems, shop, currencySymbol, changeAmount, selectedType?.name || '')
      if (shop.printer_enabled) {
        if (shop.receipt_printer_type === 'network' && shop.receipt_printer_address) {
          const ok = await sendToNetworkPrinter(shop.receipt_printer_address, receiptText)
          if (!ok) printViaWindow(receiptText, `Receipt ${receiptNumber}`)
        } else if (shop.receipt_printer_type === 'bluetooth') {
          try {
            const device = await (navigator as any).bluetooth.requestDevice({ filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }] })
            const server = await device.gatt.connect()
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
            await characteristic.writeValue(new TextEncoder().encode(receiptText))
          } catch { printViaWindow(receiptText, `Receipt ${receiptNumber}`) }
        } else {
          printViaWindow(receiptText, `Receipt ${receiptNumber}`)
        }
      }

      triggerKitchenPrint(supabase, receipt, receiptItems, shop.id, currencySymbol)
        .catch(err => console.error('Kitchen print failed:', err))

      setLastReceipt(receipt)
      setLastReceiptItems(receiptItems)
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
              if (lastReceipt && lastReceiptItems.length > 0 && shop) {
                printViaWindow(
                  buildReceiptText(lastReceipt, lastReceiptItems, shop, currencySymbol, change, selectedType?.name || ''),
                  `Receipt ${lastReceipt.receipt_number}`
                )
              }
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
              <input
                type="number"
                value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
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
          <Button
            className="w-full"
            size="lg"
            onClick={handleCharge}
            disabled={loading || (isCash && cashAmount < total)}
          >
            {loading ? 'Processing...' : `Confirm ${selectedType?.name || ''} Payment`}
          </Button>
        </div>
      </div>
    </div>
  )
}
