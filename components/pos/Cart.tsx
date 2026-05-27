'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { Trash2, Plus, Minus, ShoppingCart, Tag, Percent, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShop } from '@/lib/hooks/useShop'
import { createClient } from '@/lib/supabase/client'
import PaymentModal from './PaymentModal'

interface CartProps {
  diningOption?: any
  activeShiftId?: string | null
  onPaymentComplete?: () => void
}

type TaxRate = { id: string; name: string; rate: number; is_active: boolean }
type Discount = { id: string; name: string; type: 'percent' | 'fixed'; value: number; is_active: boolean }

export default function Cart({ diningOption, activeShiftId, onPaymentComplete }: CartProps) {
  const supabase = createClient()
  const { items, removeItem, updateQuantity, subtotal, discountAmount, setDiscount, clearCart } = useCart()
  const { currencySymbol } = useShop()

  const [showPayment, setShowPayment] = useState(false)

  // Tax state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [selectedTax, setSelectedTax] = useState<TaxRate | null>(null)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [showTaxDropdown, setShowTaxDropdown] = useState(false)

  // Discount state
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null)
  const [discountEnabled, setDiscountEnabled] = useState(false)
  const [showDiscountDropdown, setShowDiscountDropdown] = useState(false)

  // Load tax rates and discounts from DB
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('shop_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!appUser?.shop_id) return

      const [{ data: taxes }, { data: discs }] = await Promise.all([
        supabase.from('tax_rates').select('*').eq('shop_id', appUser.shop_id).eq('is_active', true).order('created_at'),
        supabase.from('discounts').select('*').eq('shop_id', appUser.shop_id).eq('is_active', true).order('created_at'),
      ])

      setTaxRates(taxes || [])
      setDiscounts(discs || [])

      // Auto-select first tax rate if only one exists
      if (taxes && taxes.length === 1) {
        setSelectedTax(taxes[0])
      }
    }
    load()
  }, [])

  const sub = subtotal()
  const taxAmount = taxEnabled && selectedTax ? sub * (selectedTax.rate / 100) : 0

  const computedDiscount = (() => {
    if (!discountEnabled || !selectedDiscount) return 0
    if (selectedDiscount.type === 'percent') return Math.min(sub * (selectedDiscount.value / 100), sub)
    return Math.min(selectedDiscount.value, sub)
  })()

  // Keep zustand discount in sync
  useEffect(() => {
  setDiscount(computedDiscount)
}, [computedDiscount])

  const tot = Math.max(0, sub + taxAmount - computedDiscount)

  function handleTaxToggle() {
    if (!taxEnabled && taxRates.length > 0 && !selectedTax) {
      setSelectedTax(taxRates[0])
    }
    setTaxEnabled(v => !v)
    setShowTaxDropdown(false)
  }

  function handleDiscountToggle() {
    if (!discountEnabled && discounts.length > 0 && !selectedDiscount) {
      setSelectedDiscount(discounts[0])
    }
    setDiscountEnabled(d => !d)
    setShowDiscountDropdown(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Order</span>
          {diningOption && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {diningOption?.name}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700">
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
                    {item.addons && item.addons.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.addons.map(a => (
                          <p key={a.id} className="text-xs text-indigo-600">
                            + {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''} ({currencySymbol}{(a.price * a.quantity).toFixed(2)})
                          </p>
                        ))}
                      </div>
                    )}
                    {item.note && (
                      <p className="text-xs text-amber-600 mt-0.5">📝 {item.note}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {currencySymbol}{item.price.toFixed(2)}
                      {item.addons?.length > 0 && <span> + addons</span>} each
                    </p>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
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
                  <p className="text-sm font-semibold text-gray-900">{currencySymbol}{item.lineTotal.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tax + Discount toggles */}
      {items.length > 0 && (
        <div className="border-t border-gray-100 px-4 pt-3 pb-1 space-y-2">

          {/* Tax toggle */}
          {taxRates.length > 0 && (
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTaxToggle}
                  className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${taxEnabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
                >
                  <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${taxEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <Percent className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-600">Tax</span>
              </div>
              {taxEnabled && (
                <div className="relative">
                  <button
                    onClick={() => setShowTaxDropdown(v => !v)}
                    className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    <span>{selectedTax ? `${selectedTax.name} (${selectedTax.rate}%)` : 'Select'}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {showTaxDropdown && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-36 overflow-hidden">
                      {taxRates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTax(t); setShowTaxDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${selectedTax?.id === t.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                        >
                          {t.name} — {t.rate}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No tax rates configured */}
          {taxRates.length === 0 && (
            <div className="flex items-center gap-2 opacity-40">
              <div className="w-8 h-4 rounded-full bg-gray-200 flex-shrink-0" />
              <Percent className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">No tax rates configured</span>
            </div>
          )}

          {/* Discount toggle */}
          {discounts.length > 0 && (
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscountToggle}
                  className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${discountEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                >
                  <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${discountEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-600">Discount</span>
              </div>
              {discountEnabled && (
                <div className="relative">
                  <button
                    onClick={() => setShowDiscountDropdown(v => !v)}
                    className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    <span>
                      {selectedDiscount
                        ? `${selectedDiscount.name} (${selectedDiscount.type === 'percent' ? `${selectedDiscount.value}%` : `${currencySymbol}${selectedDiscount.value.toFixed(2)}`})`
                        : 'Select'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {showDiscountDropdown && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-40 overflow-hidden">
                      {discounts.map(d => (
                        <button
                          key={d.id}
                          onClick={() => { setSelectedDiscount(d); setShowDiscountDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${selectedDiscount?.id === d.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'}`}
                        >
                          {d.name} — {d.type === 'percent' ? `${d.value}%` : `${currencySymbol}${d.value.toFixed(2)}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No discounts configured */}
          {discounts.length === 0 && (
            <div className="flex items-center gap-2 opacity-40">
              <div className="w-8 h-4 rounded-full bg-gray-200 flex-shrink-0" />
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">No discounts configured</span>
            </div>
          )}

        </div>
      )}

      {/* Totals + Checkout */}
      <div className="border-t border-gray-100 p-4 space-y-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{currencySymbol}{sub.toFixed(2)}</span>
          </div>
          {taxEnabled && selectedTax && taxAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>{selectedTax.name} ({selectedTax.rate}%)</span>
              <span>+{currencySymbol}{taxAmount.toFixed(2)}</span>
            </div>
          )}
          {discountEnabled && selectedDiscount && computedDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>{selectedDiscount.name}</span>
              <span>-{currencySymbol}{computedDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 text-base pt-1 border-t border-gray-100">
            <span>Total</span>
            <span>{currencySymbol}{tot.toFixed(2)}</span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={items.length === 0}
          onClick={() => setShowPayment(true)}
        >
          Charge {currencySymbol}{tot.toFixed(2)}
        </Button>
      </div>

      {showPayment && (
        <PaymentModal
          total={tot}
          onClose={() => {
            setShowPayment(false)
            onPaymentComplete?.()
          }}
        />
      )}
    </div>
  )
}
