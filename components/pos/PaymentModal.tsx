'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { Button } from '@/components/ui/button'
import { X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useShop } from '@/lib/hooks/useShop'

interface Props {
  total: number
  onClose: () => void
}

export default function PaymentModal({ total, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { items, customerId, discountAmount, clearCart, subtotal } = useCart()
  const { currencySymbol } = useShop()
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
              <p className="text-3xl font-bold text-gray-900">{currencySymbol}{change.toFixed(2)}</p>
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
            <p className="text-4xl font-bold text-gray-900">{currencySymbol}{total.toFixed(2)}</p>          </div>

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
            {loading ? 'Processing...' : `Confirm {selectedType?.name || ''} Payment`}
          </Button>
        </div>
      </div>
    </div>
  )
}
