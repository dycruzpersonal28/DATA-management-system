'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { Trash2, Plus, Minus, ShoppingCart, Tag, Percent, ChevronDown, X, Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShop } from '@/lib/hooks/useShop'
import { createClient } from '@/lib/supabase/client'
import PaymentModal from './PaymentModal'

interface CartProps {
  diningOption?: any
  activeShiftId?: string | null
  cashierName?: string
  onPaymentComplete?: () => void
}

type TaxRate = { id: string; name: string; rate: number; is_active: boolean }
export type Discount = { id: string; name: string; type: 'percent' | 'fixed'; value: number; is_active: boolean }
export type ItemDiscount = { discount: Discount; amount: number }

// ── Item Edit Modal ────────────────────────────────────────
function ItemEditModal({
  item,
  discounts,
  currentDiscount,
  currentNote,
  currencySymbol,
  onApply,
  onRemove,
  onClose,
}: any) {
  const [selected, setSelected] = useState<Discount | null>(currentDiscount?.discount || null)
  const [note, setNote] = useState(currentNote)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold">{item.name}</p>
          </div>
          <button onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full border rounded-xl p-2 text-sm"
          />
        </div>

        <div className="px-3 pb-4 flex gap-2">
          <button
            onClick={onRemove}
            className="flex-1 py-2 rounded-xl border text-red-500"
          >
            Clear
          </button>
          <button
            onClick={() => onApply(selected, note.trim())}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Cart({
  diningOption,
  activeShiftId,
  cashierName,
  onPaymentComplete
}: CartProps) {

  const supabase = createClient()
  const { items, removeItem, updateQuantity, subtotal, setDiscount, clearCart } = useCart()
  const { currencySymbol } = useShop()

  const [showPayment, setShowPayment] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [selectedTax, setSelectedTax] = useState<TaxRate | null>(null)
  const [taxEnabled, setTaxEnabled] = useState(false)

  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null)
  const [discountEnabled, setDiscountEnabled] = useState(false)

  const [itemDiscounts, setItemDiscounts] = useState<Map<string, ItemDiscount>>(new Map())
  const [itemNotes, setItemNotes] = useState<Map<string, string>>(new Map())
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  // ── LOAD DATA ─────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('id, shop_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!appUser?.shop_id) return
      setCurrentUserId(appUser.id)

      const [{ data: taxes }, { data: discs }] = await Promise.all([
        supabase.from('tax_rates').select('*').eq('shop_id', appUser.shop_id),
        supabase.from('discounts').select('*').eq('shop_id', appUser.shop_id),
      ])

      setTaxRates(taxes || [])
      setDiscounts(discs || [])
    }

    load()
  }, [])

  const sub = subtotal()
  const taxAmount = taxEnabled && selectedTax ? sub * (selectedTax.rate / 100) : 0

  const itemDiscountTotal = Array.from(itemDiscounts.values())
    .reduce((s, d) => s + d.amount, 0)

  const receiptDiscount = 0
  const total = sub + taxAmount - itemDiscountTotal - receiptDiscount

  const editingItem = items.find(i => i.id === editingItemId)

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">

      {/* HEADER */}
      <div className="px-4 py-3 border-b">
        <ShoppingCart className="w-4 h-4 inline mr-2" />
        Order
      </div>

      {/* SCROLL AREA (FIXED) */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain'
        }}
      >
        {items.map(item => (
          <div key={item.id} className="p-3 border-b">
            {item.name}
          </div>
        ))}
      </div>

      {/* TAX / DISCOUNT */}
      <div className="shrink-0 border-t px-4 py-2">
        Tax & Discount section
      </div>

      {/* TOTALS + BUTTON (FIXED) */}
      <div
        className="shrink-0 border-t p-4 space-y-3 bg-white"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)'
        }}
      >
        <div className="flex justify-between">
          <span>Total</span>
          <span>{currencySymbol}{total.toFixed(2)}</span>
        </div>

        <Button
          className="w-full"
          onClick={() => setShowPayment(true)}
          disabled={items.length === 0}
        >
          Charge {currencySymbol}{total.toFixed(2)}
        </Button>
      </div>

      {/* PAYMENT */}
      {showPayment && (
        <PaymentModal
          total={total}
          itemNotes={itemNotes}
          itemDiscounts={itemDiscounts}
          employeeId={currentUserId ?? undefined}
          cashierName={cashierName}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}