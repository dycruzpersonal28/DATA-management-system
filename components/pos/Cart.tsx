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
            <p className="text-sm font-semibold text-gray-900">Edit Item</p>
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{item.name}</p>
          </div>
          <button onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-400">Discount</p>

          {discounts.map((d: any) => (
            <button
              key={d.id}
              onClick={() => setSelected(selected?.id === d.id ? null : d)}
              className="w-full flex justify-between p-2 border rounded-xl"
            >
              <span>{d.name}</span>
              {selected?.id === d.id && <Check className="w-4 h-4 text-green-500" />}
            </button>
          ))}

          <p className="text-xs font-semibold text-gray-400 mt-2">Note</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full border rounded-xl p-2 text-sm"
          />
        </div>

        <div className="px-3 pb-4 flex gap-2">
          <button onClick={onRemove} className="flex-1 py-2 border rounded-xl">
            Clear
          </button>
          <button
            onClick={() => onApply(selected, note.trim())}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl"
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

  const tot = subtotal()

  return (

    // ✅ FIX 1: use h-screen instead of h-[100vh]
    <div className="flex flex-col h-screen overflow-hidden">

      {/* HEADER */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          <span className="font-semibold">Order</span>
        </div>

        {items.length > 0 && (
          <button onClick={clearCart} className="text-xs text-red-500">
            Clear
          </button>
        )}
      </div>

      {/* ✅ FIX 2: SCROLL AREA */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain'
        }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <ShoppingCart className="w-8 h-8" />
            <p>No items yet</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {items.map(item => (
              <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between">
                  <span>{item.name}</span>
                  <button onClick={() => removeItem(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="shrink-0 border-t p-4">
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{currencySymbol}{tot.toFixed(2)}</span>
        </div>

        <button
          className="w-full mt-3 bg-indigo-600 text-white py-3 rounded-xl"
          disabled={items.length === 0}
          onClick={() => setShowPayment(true)}
        >
          Charge {currencySymbol}{tot.toFixed(2)}
        </button>
      </div>

      {showPayment && (
        <PaymentModal
          total={tot}
          itemNotes={new Map()}
          itemDiscounts={new Map()}
          onClose={() => {
            setShowPayment(false)
            onPaymentComplete?.()
          }}
        />
      )}

    </div>
  )
}