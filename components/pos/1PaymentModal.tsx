'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { Button } from '@/components/ui/button'
import { X, Check, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useShop } from '@/lib/hooks/useShop'
import { Capacitor } from '@capacitor/core'
import { printToBlePrinter } from '@/lib/printing/blePrinter'

import type { ItemDiscount } from './Cart'

interface Props {
  total: number
  onClose: () => void
  onPaymentComplete?: () => void
  employeeId?: string
  itemNotes?: Map<string, string>
  itemDiscounts?: Map<string, ItemDiscount>
  cashierName?: string
}

function buildReceiptText(receipt: any, items: any[], shop: any, currencySymbol: string, change: number, paymentName: string, cashierName?: string | null): string {
  const line = '--------------------------------'
  const center = (s: string) => s.padStart(Math.floor((32 + s.length) / 2)).padEnd(32)
  const row = (left: string, right: string) => {
    const space = 32 - left.length - right.length
    if (space < 1) {
      const trimmedLeft = left.substring(0, Math.max(0, 32 - right.length - 1))
      return trimmedLeft + ' ' + right
    }
    return left + ' '.repeat(space) + right
  }
  const headerLines: string[] = [
    center(shop?.name || 'Receipt'),
    shop?.address ? center(shop.address) : '',
    shop?.phone ? center(shop.phone) : '',
    ...(shop?.receipt_header ? String(shop.receipt_header).split('\n').map((l: string) => center(l)) : []),
  ]
  const lines: string[] = [
    ...headerLines,
    '',
    center(`Receipt #${receipt.receipt_number}`),
    center(new Date(receipt.created_at).toLocaleString()),
    cashierName ? center(`Cashier: ${cashierName}`) : '',
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
    addons: Array<{ name: string; quantity: number; ingredients: Array<{ name: string; quantity: number }> }>
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

    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        const addonLine = `  + ${addon.name}${addon.quantity > 1 ? ` x${addon.quantity}` : ''}`
        for (const c of addonLine) cmd.push(c.charCodeAt(0))
        cmd.push(0x0a)
        if (showIngredients && addon.ingredients && addon.ingredients.length > 0) {
          for (const ing of addon.ingredients) {
            const ingLine = `    - ${ing.name} (x${ing.quantity})`
            for (const c of ingLine) cmd.push(c.charCodeAt(0))
            cmd.push(0x0a)
          }
        }
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

// Cache paired BT devices so we can reconnect without re-prompting
const btDeviceCache = new Map<string, any>()

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

// Web Bluetooth fallback — only used when running in a regular browser tab
// (e.g. testing on desktop Chrome). Does NOT work inside the Capacitor
// Android WebView, which is why the native path below exists.
async function sendToBluetoothPrinterWeb(deviceName: string, data: Uint8Array): Promise<boolean> {
  try {
    const bt = (navigator as any).bluetooth
    if (!bt) return false

    let device = btDeviceCache.get(deviceName)
    if (!device) {
      const requestOpts: any = deviceName
        ? { filters: [{ name: deviceName }], optionalServices: BT_SERVICE_UUIDS }
        : { acceptAllDevices: true, optionalServices: BT_SERVICE_UUIDS }
      device = await bt.requestDevice(requestOpts)
      btDeviceCache.set(deviceName, device)
    }

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

// Platform-aware entry point. `deviceIdentifier` is whatever is saved in
// shop.receipt_printer_address — a BLE deviceId (paired via
// BluetoothPrinterPicker) when running natively, or a device name when
// falling back to Web Bluetooth in a browser. Works with any generic
// BLE ESC/POS printer, not a specific brand.
async function sendToBluetoothPrinter(deviceIdentifier: string, data: Uint8Array): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return printToBlePrinter(deviceIdentifier, data)
  }
  return sendToBluetoothPrinterWeb(deviceIdentifier, data)
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

function printViaWindow(text: string, title: string, logoUrl?: string | null) {
  const win = window.open('', '_blank', 'width=320,height=640')
  if (!win) return

  const logoHtml = logoUrl
    ? `<div class="logo"><img src="${logoUrl}" /></div>`
    : ''

  let firstContentLine = true
  const bodyHtml = text.split('\n').map(l => {
    const escaped = l.replace(/</g, '&lt;')
    const isDividerEq   = /^={10,}$/.test(l)
    const isDividerDash = /^-{10,}$/.test(l)
    const isTotal       = /^TOTAL\s/.test(l)
    const isBlank       = l.trim() === ''
    const isStoreName   = firstContentLine && !isBlank && !isDividerDash && !isDividerEq

    if (isStoreName) { firstContentLine = false; return `<div class="store-name">${escaped}</div>` }
    if (isDividerEq)   return `<hr class="thick" />`
    if (isDividerDash) return `<hr class="thin" />`
    if (isTotal)       return `<div class="total-line">${escaped}</div>`
    return `<div>${escaped || '&nbsp;'}</div>`
  }).join('')

  win.document.write(`<html><head><title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 58mm; margin: 0 auto; padding: 4mm 2mm; background: #fff; color: #000; }
      div { line-height: 1.5; white-space: pre; word-break: break-all; }
      .logo { text-align: center; margin-bottom: 6px; }
      .logo img { max-height: 52px; max-width: 150px; object-fit: contain; }
      .store-name { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 2px; white-space: normal; }
      .total-line { font-size: 12px; font-weight: bold; white-space: pre; }
      hr.thin  { border: none; border-top: 1px dashed #666; margin: 3px 0; }
      hr.thick { border: none; border-top: 2px solid #000; margin: 3px 0; }
      @media print { @page { size: 58mm auto; margin: 0; } body { padding: 2mm; } }
    </style></head>
    <body>${logoHtml}${bodyHtml}</body></html>`)
  win.document.close(); win.focus(); win.print()
}

// Confirmed against /api/receipts: each addon is persisted as
// { id, name, price, quantity } where `id` is the referenced item's id
// (same field the receipts route itself uses for ingredient/COGS lookups).
function resolveAddonItemId(a: any): string | undefined {
  return a?.id ?? undefined
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

    const baseItemIds = receiptItems.map((ri: any) => ri.item_id).filter(Boolean)
    const addonItemIds = receiptItems
      .flatMap((ri: any) => Array.isArray(ri.addons) ? ri.addons.map(resolveAddonItemId) : [])
      .filter(Boolean) as string[]
    const itemIds = [...new Set([...baseItemIds, ...addonItemIds])]

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
    if (printerItems.size === 0) {
      toast.warning('No kitchen printer is assigned to the categories in this order', { duration: 6000 })
      return
    }

    let anyFailed = false

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
        addons: Array.isArray(ri.addons) ? ri.addons.map((a: any) => ({
          name: a.name,
          quantity: Number(a.quantity) || 1,
          ingredients: ingredientsByItem.get(resolveAddonItemId(a) || '') || [],
        })) : [],
      }))

      if (group.printer_type === 'bluetooth') {
        const data = buildKitchenTicket(receipt, kitchenItems, group.name, paperWidth, showAmounts, showIngreds, currencySymbol)
        const ok = await sendToBluetoothPrinter(group.printer_address || '', data)
        if (!ok) {
          anyFailed = true
          const text = buildFallbackText(receipt, kitchenItems, group.name, showAmounts, showIngreds, currencySymbol)
          printViaWindow(text, `Kitchen - ${group.name}`)
          toast.warning(`${group.name}: Bluetooth failed, opened print window instead`, { duration: 6000 })
        } else {
          toast.success(`Sent to ${group.name}`)
        }
      } else if (group.printer_type === 'network' || group.printer_type === 'wifi') {
        const text = buildFallbackText(receipt, kitchenItems, group.name, showAmounts, showIngreds, currencySymbol)
        const ok = await sendToNetworkPrinter(group.printer_address, text)
        if (!ok) {
          anyFailed = true
          toast.warning(`${group.name}: Network print failed — check the printer's connection`, { duration: 6000 })
        } else {
          toast.success(`Sent to ${group.name}`)
        }
      }
    }

    if (anyFailed) {
      toast.error('One or more kitchen tickets failed to print — use "Reprint to Kitchen" once fixed', { duration: 6000 })
    }
  } catch (err) {
    console.error('Kitchen print error:', err)
    toast.error('Kitchen print failed to send — check your printer setup', { duration: 6000 })
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
    if (item.addons?.length > 0) {
      for (const addon of item.addons) {
        lines.push(`  + ${addon.name}${addon.quantity > 1 ? ` x${addon.quantity}` : ''}`)
        if (showIngredients && addon.ingredients?.length > 0) {
          for (const ing of addon.ingredients) lines.push(`    - ${ing.name} (x${ing.quantity})`)
        }
      }
    }
    if (item.note) lines.push(`  >> ${item.note}`)
    lines.push('')
  }
  lines.push('================================', '', '')
  return lines.join('\n')
}

function buildReceiptESCPOS(
  receipt: any,
  items: any[],
  shop: any,
  currencySymbol: string,
  change: number,
  paymentName: string,
  cashierName?: string | null,
): Uint8Array {
  const ESC = 0x1b
  const GS  = 0x1d
  const W   = 32 // chars per line on 58mm paper

  const cmd: number[] = []

  // Safe ASCII encode — replace multi-byte currency symbols
  const safeText = (s: string) => {
    const safe = s.replace(/₱/g, 'PHP').replace(/[^\x00-\x7F]/g, '?')
    for (const c of safe) cmd.push(c.charCodeAt(0) & 0xff)
  }
  const lf  = () => cmd.push(0x0a)
  const line = (s: string) => { safeText(s); lf() }
  const blank = () => lf()

  const padCenter = (s: string, w = W) => {
    const pad = Math.max(0, Math.floor((w - s.length) / 2))
    return ' '.repeat(pad) + s.substring(0, w)
  }
  const twoCol = (left: string, right: string, w = W) => {
    const gap = w - left.length - right.length
    return gap > 0 ? left + ' '.repeat(gap) + right : left.substring(0, w - right.length - 1) + ' ' + right
  }
  const sym = currencySymbol.replace(/₱/g, 'PHP')

  // ── Init ────────────────────────────────────────────────────────────────────
  cmd.push(ESC, 0x40)                  // initialize

  // ── Store name — centered, bold, double-height ──────────────────────────────
  cmd.push(ESC, 0x61, 0x01)           // align center
  cmd.push(GS,  0x21, 0x01)           // double height only (keeps 32-char width)
  cmd.push(ESC, 0x45, 0x01)           // bold on
  line(shop?.name || 'Receipt')
  cmd.push(GS,  0x21, 0x00)           // normal size
  cmd.push(ESC, 0x45, 0x00)           // bold off

  if (shop?.address) line(shop.address)
  if (shop?.phone)   line(shop.phone)
  if (shop?.receipt_header) {
    for (const l of String(shop.receipt_header).split('\n')) line(l)
  }
  blank()

  // ── Meta — left aligned ─────────────────────────────────────────────────────
  cmd.push(ESC, 0x61, 0x00)           // align left
  line(padCenter(`Receipt #${receipt.receipt_number}`))
  line(padCenter(new Date(receipt.created_at).toLocaleString()))
  if (cashierName) line(padCenter(`Cashier: ${cashierName}`))
  line('-'.repeat(W))

  // ── Items ───────────────────────────────────────────────────────────────────
  for (const item of items) {
    line(twoCol(`${item.quantity}x ${item.item_name}`, `${sym}${Number(item.line_total).toFixed(2)}`))
    if (item.addons?.length) {
      for (const a of item.addons) {
        const label = `  + ${a.name}${a.quantity > 1 ? ` x${a.quantity}` : ''}`
        line(twoCol(label, `${sym}${(a.price * a.quantity).toFixed(2)}`))
      }
    }
    if (item.note) line(`  >> ${item.note}`)
  }

  // ── Subtotal ─────────────────────────────────────────────────────────────────
  line('-'.repeat(W))
  line(twoCol('Subtotal', `${sym}${Number(receipt.subtotal).toFixed(2)}`))
  if (Number(receipt.discount_amount) > 0) {
    line(twoCol('Discount', `-${sym}${Number(receipt.discount_amount).toFixed(2)}`))
  }

  // ── TOTAL — bold, double-height ──────────────────────────────────────────────
  line('='.repeat(W))
  cmd.push(GS,  0x21, 0x01)           // double height only (keeps 32-char width)
  cmd.push(ESC, 0x45, 0x01)           // bold on
  line(twoCol('TOTAL', `${sym}${Number(receipt.total).toFixed(2)}`))
  cmd.push(GS,  0x21, 0x00)           // normal size
  cmd.push(ESC, 0x45, 0x00)           // bold off
  line('='.repeat(W))

  // ── Payment details ───────────────────────────────────────────────────────────
  line(twoCol('Payment', paymentName))
  if (change > 0) line(twoCol('Change', `${sym}${change.toFixed(2)}`))

  // ── Footer ────────────────────────────────────────────────────────────────────
  blank()
  cmd.push(ESC, 0x61, 0x01)           // center
  line(shop?.receipt_footer || 'Thank you!')
  blank()

  // Feed 4 lines + partial cut
  cmd.push(ESC, 0x64, 0x04)
  cmd.push(GS,  0x56, 0x42, 0x00)

  return new Uint8Array(cmd)
}

export default function PaymentModal({ total, onClose, onPaymentComplete, itemNotes, itemDiscounts, cashierName: cashierNameProp }: Props) {
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
  const [cashierName, setCashierName] = useState<string | null>(cashierNameProp ?? null)
  const [kitchenPrinting, setKitchenPrinting] = useState(false)
  const [kitchenPrintArgs, setKitchenPrintArgs] = useState<{ receipt: any; receiptItems: any[]; shopId: string } | null>(null)
  const [confirmKitchenReprint, setConfirmKitchenReprint] = useState(false)
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
      let employeeRecordId: string | null = null
      let resolvedEmployeeName: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: appUser } = await supabase.from('app_users').select('id, name').eq('auth_user_id', user.id).single()
          appUserId = appUser?.id || null
          resolvedEmployeeName = appUser?.name || null
          setCashierName(resolvedEmployeeName)
          if (appUserId) {
            const { data: empRow } = await supabase.from('employees').select('id').eq('app_user_id', appUserId).maybeSingle()
            employeeRecordId = empRow?.id || null
          }
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

      // ── PWD duplicate check ───────────────────────────────────────────────
      const pwdEntries = itemDiscounts
        ? Array.from(itemDiscounts.entries())
            .filter(([, d]) => d.idRef && d.discount.name.toLowerCase().includes('pwd'))
        : []

      if (pwdEntries.length > 0) {
        const { data: shopRow } = await supabase
          .from('shops').select('timezone').eq('id', shop.id).single()
        const tz = shopRow?.timezone ?? 'Asia/Manila'
        const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())

        // Collect all unique PWD IDs being used in this transaction
        const pwdIdsToCheck = [...new Set(pwdEntries.map(([, d]) => d.idRef as string))]

        // Convert today shop-timezone bounds to UTC for correct comparison
        const probeStart = new Date(`${todayDate}T00:00:00Z`)
        const tzFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        })
        const tzParts = tzFormatter.formatToParts(probeStart)
        const tzGet = (t: string) => tzParts.find(p => p.type === t)?.value ?? '00'
        const shopLocalIso = `${tzGet('year')}-${tzGet('month')}-${tzGet('day')}T${tzGet('hour')}:${tzGet('minute')}:${tzGet('second')}`
        const offsetMs = probeStart.getTime() - new Date(shopLocalIso + 'Z').getTime()
        const startUtc = new Date(new Date(`${todayDate}T00:00:00Z`).getTime() + offsetMs).toISOString()
        const endUtc   = new Date(new Date(`${todayDate}T23:59:59Z`).getTime() + offsetMs).toISOString()

        // Query receipts for today using UTC bounds
        const { data: todayReceipts } = await supabase
          .from('receipts')
          .select('id, receipt_number, created_at')
          .eq('shop_id', shop.id)
          .eq('status', 'completed')
          .gte('created_at', startUtc)
          .lte('created_at', endUtc)

        if (todayReceipts && todayReceipts.length > 0) {
          const todayReceiptIds = todayReceipts.map((r: any) => r.id)
          const { data: matchingItems } = await supabase
            .from('receipt_items')
            .select('receipt_id, modifiers')
            .in('receipt_id', todayReceiptIds)

          const receiptMap = new Map(todayReceipts.map((r: any) => [r.id, r]))

          for (const pwdId of pwdIdsToCheck) {
            const duplicate = (matchingItems || []).find((ri: any) => {
              const mods: any[] = Array.isArray(ri.modifiers) ? ri.modifiers : []
              return mods.some(m => m.type === 'discount_id' && m.value === pwdId)
            })
            if (duplicate) {
              const dupeReceipt = receiptMap.get(duplicate.receipt_id)
              const receiptNum = dupeReceipt?.receipt_number ?? 'unknown'
              const usedAt = dupeReceipt?.created_at
                ? new Date(dupeReceipt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''
              setLoading(false)
              toast.error(
                `PWD ID ${pwdId} was already used today on receipt ${receiptNum}${usedAt ? ` at ${usedAt}` : ''}.`,
                { duration: 8000 }
              )
              return
            }
          }
        }
      }
      // ── End PWD duplicate check ───────────────────────────────────────────

      const sub = subtotal()
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id, employee_id: employeeRecordId, customer_id: customerId || null,
          receipt_number: receiptNumber, subtotal: sub, discount_amount: discountAmount,
          tax_amount: 0, total,
          payment_type_id: selectedType?.id !== 'cash' && selectedType?.id !== 'card' ? selectedType.id : null,
          amount_tendered: isCash ? cashAmount : total, change_amount: changeAmount,
          loyalty_points_earned: Math.floor(total), loyalty_points_redeemed: 0,
          shift_id: activeShiftId, status: 'completed',
          items: items.map(item => {
            const itemDisc = itemDiscounts?.get(item.id)
            return {
              ...item,
              note: itemNotes?.get(item.id) ?? item.note ?? undefined,
              discount_name:   itemDisc?.discount?.name   ?? null,
              discount_amount: itemDisc?.amount           ?? 0,
              discount_id_ref: itemDisc?.idRef            ?? null,
            }
          }),
        }),
      })

      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to process payment') }
      const { receipt, receiptItems } = await res.json()

      const receiptText = buildReceiptText(receipt, receiptItems, shop, currencySymbol, changeAmount, selectedType?.name || '', resolvedEmployeeName)
      if (shop.printer_enabled) {
        if (shop.receipt_printer_type === 'network' && shop.receipt_printer_address) {
          const ok = await sendToNetworkPrinter(shop.receipt_printer_address, receiptText)
          if (!ok) printViaWindow(receiptText, `Receipt ${receiptNumber}`, shop?.logo_url)
        } else if (shop.receipt_printer_type === 'bluetooth') {
          const receiptBytes = buildReceiptESCPOS(receipt, receiptItems, shop, currencySymbol, changeAmount, selectedType?.name || '', resolvedEmployeeName)
          const ok = await sendToBluetoothPrinter(shop.receipt_printer_address || '', receiptBytes)
          if (!ok) printViaWindow(receiptText, `Receipt ${receiptNumber}`, shop?.logo_url)
        } else {
          printViaWindow(receiptText, `Receipt ${receiptNumber}`, shop?.logo_url)
        }
      }

      setKitchenPrintArgs({ receipt, receiptItems, shopId: shop.id })
      setKitchenPrinting(true)
      try {
        await triggerKitchenPrint(supabase, receipt, receiptItems, shop.id, currencySymbol)
      } catch (err) {
        console.error('Kitchen print failed:', err)
      } finally {
        setKitchenPrinting(false)
      }

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
                  buildReceiptText(lastReceipt, lastReceiptItems, shop, currencySymbol, change, selectedType?.name || '', cashierName),
                  `Receipt ${lastReceipt.receipt_number}`,
                  shop?.logo_url
                )
              }
            }}>
              <Printer className="w-4 h-4 mr-1.5" />Reprint
            </Button>
            <Button className="flex-1" onClick={onPaymentComplete ?? onClose}>New order</Button>
          </div>
          {kitchenPrintArgs && (
            confirmKitchenReprint ? (
              <div className="w-full space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 text-left">
                  This resends the ticket to the kitchen printer(s). Check the kitchen before using this — only resend if the ticket didn't come out the first time, so the kitchen doesn't get a duplicate.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={kitchenPrinting}
                    onClick={() => setConfirmKitchenReprint(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={kitchenPrinting}
                    onClick={async () => {
                      setKitchenPrinting(true)
                      try {
                        await triggerKitchenPrint(supabase, kitchenPrintArgs.receipt, kitchenPrintArgs.receiptItems, kitchenPrintArgs.shopId, currencySymbol)
                      } catch (err) {
                        console.error('Kitchen print failed:', err)
                      } finally {
                        setKitchenPrinting(false)
                        setConfirmKitchenReprint(false)
                      }
                    }}
                  >
                    <Printer className="w-4 h-4 mr-1.5" />
                    {kitchenPrinting ? 'Resending…' : 'Yes, resend'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                disabled={kitchenPrinting}
                onClick={() => setConfirmKitchenReprint(true)}
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Reprint to Kitchen
              </Button>
            )
          )}
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
