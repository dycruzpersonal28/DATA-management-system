'use client'

import { useState } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PaymentModal from './PaymentModal'

export default function Cart() {
  const { items, removeItem, updateQuantity, subtotal, total, discountAmount, clearCart } = useCart()
  const [showPayment, setShowPayment] = useState(false)

  const sub = subtotal()
  const tot = total()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Order</span>
        </div>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
            <ShoppingCart className="w-8 h-8" />
            <p className="text-sm">No items yet</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {items.map(item => (
              <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">${item.price.toFixed(2)} each</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    ${item.lineTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + Checkout */}
      <div className="border-t border-gray-100 p-4 space-y-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>${sub.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 text-base pt-1 border-t border-gray-100">
            <span>Total</span>
            <span>${tot.toFixed(2)}</span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={items.length === 0}
          onClick={() => setShowPayment(true)}
        >
          Charge ${tot.toFixed(2)}
        </Button>
      </div>

      {showPayment && (
        <PaymentModal
          total={tot}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}
