# ============================================================
# POS TERMINAL - ALL FILES
# Run from your project root in PowerShell
# ============================================================

# Create folders
New-Item -ItemType Directory -Force -Path "app/pos" | Out-Null
New-Item -ItemType Directory -Force -Path "app/api/receipts" | Out-Null
New-Item -ItemType Directory -Force -Path "components/pos" | Out-Null

# -- app/pos/page.tsx --
Set-Content -Path "app/pos/page.tsx" -Encoding UTF8 -Value @'
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import CategoryFilter from '@/components/pos/CategoryFilter'
import ItemGrid from '@/components/pos/ItemGrid'
import Cart from '@/components/pos/Cart'
import { ShoppingCart, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function POSPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { itemCount } = useCart()

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('shop_id', shop.id)
        .order('sort_order')

      const { data: itms } = await supabase
        .from('items')
        .select('*, categories(name, color)')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('name')

      setCategories(cats || [])
      setItems(itms || [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredItems = selectedCategory
    ? items.filter(i => i.category_id === selectedCategory)
    : items

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Left: Item selection */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-gray-900">POS Terminal</h1>
        </div>

        {/* Category filter */}
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <ShoppingCart className="w-10 h-10" />
              <p>No items found</p>
              <Link href="/items" className="text-indigo-600 text-sm hover:underline">
                Add items in back office
              </Link>
            </div>
          ) : (
            <ItemGrid items={filteredItems} />
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <Cart />
      </div>
    </div>
  )
}
'@

# -- components/pos/CategoryFilter.tsx --
Set-Content -Path "components/pos/CategoryFilter.tsx" -Encoding UTF8 -Value @'
'use client'

interface Props {
  categories: any[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export default function CategoryFilter({ categories, selected, onSelect }: Props) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
      <button
        onClick={() => onSelect(null)}
        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          selected === null
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            selected === cat.id
              ? 'text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={selected === cat.id ? { backgroundColor: cat.color } : {}}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
'@

# -- components/pos/ItemGrid.tsx --
Set-Content -Path "components/pos/ItemGrid.tsx" -Encoding UTF8 -Value @'
'use client'

import { useCart } from '@/lib/hooks/useCart'
import { toast } from 'sonner'

interface Props {
  items: any[]
}

export default function ItemGrid({ items }: Props) {
  const { addItem } = useCart()

  function handleAdd(item: any) {
    addItem({
      itemId: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: 1,
      modifiers: [],
      trackStock: item.track_stock,
    })
    toast.success(`${item.name} added`)
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => handleAdd(item)}
          className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-indigo-300 hover:shadow-sm active:scale-95 transition-all"
        >
          {/* Color bar from category */}
          <div
            className="w-full h-1 rounded-full mb-2"
            style={{ backgroundColor: item.categories?.color || '#e5e7eb' }}
          />
          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
          {item.categories && (
            <p className="text-xs text-gray-400 truncate">{item.categories.name}</p>
          )}
          <p className="text-sm font-semibold text-indigo-600 mt-1">
            ${Number(item.price).toFixed(2)}
          </p>
        </button>
      ))}
    </div>
  )
}
'@

# -- components/pos/Cart.tsx --
Set-Content -Path "components/pos/Cart.tsx" -Encoding UTF8 -Value @'
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
'@

# -- components/pos/PaymentModal.tsx --
Set-Content -Path "components/pos/PaymentModal.tsx" -Encoding UTF8 -Value @'
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { Button } from '@/components/ui/button'
import { X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
  total: number
  onClose: () => void
}

export default function PaymentModal({ total, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { items, customerId, discountAmount, clearCart, subtotal } = useCart()
  const [paymentTypes, setPaymentTypes] = useState<any[]>([])
  const [selectedType, setSelectedType] = useState<any>(null)
  const [cashInput, setCashInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [change, setChange] = useState(0)

  useEffect(() => {
    supabase
      .from('payment_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const types = data || []
        // Default payment types if none exist
        if (types.length === 0) {
          setPaymentTypes([
            { id: 'cash', name: 'Cash' },
            { id: 'card', name: 'Card' },
          ])
        } else {
          setPaymentTypes(types)
        }
        setSelectedType(types[0] || { id: 'cash', name: 'Cash' })
      })
  }, [])

  const isCash = selectedType?.name?.toLowerCase() === 'cash'
  const cashAmount = parseFloat(cashInput) || 0
  const changeAmount = isCash ? Math.max(0, cashAmount - total) : 0

  async function handleCharge() {
    if (isCash && cashAmount < total) {
      toast.error('Cash amount is less than total')
      return
    }

    setLoading(true)

    try {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) throw new Error('No shop found')

      // Get next receipt number
      const { count } = await supabase
        .from('receipts')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shop.id)

      const receiptNumber = `R-${String((count || 0) + 1).padStart(6, '0')}`

      // Get employee from localStorage
      let employeeId = null
      try {
        const emp = JSON.parse(localStorage.getItem('pos_employee') || 'null')
        employeeId = emp?.id || null
      } catch {}

      const sub = subtotal()

      // Create receipt
      const { data: receipt, error } = await supabase
        .from('receipts')
        .insert({
          shop_id: shop.id,
          employee_id: employeeId,
          customer_id: customerId || null,
          receipt_number: receiptNumber,
          subtotal: sub,
          discount_amount: discountAmount,
          tax_amount: 0,
          total: total,
          payment_type_id: selectedType?.id !== 'cash' && selectedType?.id !== 'card' ? selectedType.id : null,
          amount_tendered: isCash ? cashAmount : total,
          change_amount: changeAmount,
          loyalty_points_earned: Math.floor(total),
          loyalty_points_redeemed: 0,
          status: 'completed',
        })
        .select()
        .single()

      if (error) throw error

      // Create receipt items
      const receiptItems = items.map(item => ({
        receipt_id: receipt.id,
        item_id: item.itemId,
        item_name: item.name,
        unit_price: item.price,
        quantity: item.quantity,
        discount_amount: 0,
        tax_amount: 0,
        line_total: item.lineTotal,
        modifiers: item.modifiers,
      }))

      await supabase.from('receipt_items').insert(receiptItems)

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
              <p className="text-3xl font-bold text-gray-900">${change.toFixed(2)}</p>
            </div>
          )}
          <Button className="w-full" onClick={onClose}>
            New order
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Total */}
          <div className="text-center">
            <p className="text-sm text-gray-500">Total due</p>
            <p className="text-4xl font-bold text-gray-900">${total.toFixed(2)}</p>
          </div>

          {/* Payment type selection */}
          <div className="grid grid-cols-2 gap-2">
            {paymentTypes.map(pt => (
              <button
                key={pt.id}
                onClick={() => setSelectedType(pt)}
                className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                  selectedType?.id === pt.id
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {pt.name}
              </button>
            ))}
          </div>

          {/* Cash input */}
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
              {/* Quick cash buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {[total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20]
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .map(amount => (
                    <button
                      key={amount}
                      onClick={() => setCashInput(amount.toFixed(2))}
                      className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                    >
                      ${amount.toFixed(0)}
                    </button>
                  ))}
              </div>
              {cashAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Change</span>
                  <span className="font-semibold text-green-600">${changeAmount.toFixed(2)}</span>
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
'@

Write-Host "POS files created successfully!" -ForegroundColor Green
Write-Host "Next: run the dev server and go to localhost:3000/pos" -ForegroundColor Yellow
