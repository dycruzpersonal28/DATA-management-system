'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Delete, ArrowLeft } from 'lucide-react'

export default function PinPage() {
  const router = useRouter()
  const supabase = createClient()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shopName, setShopName] = useState('POS System')

  useEffect(() => {
    async function loadShop() {
      const { data } = await supabase.from('shops').select('name').single()
      if (data) setShopName(data.name)
    }
    loadShop()
  }, [])

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin(pin)
    }
  }, [pin])

  async function verifyPin(enteredPin: string) {
    setError('')
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('pin', enteredPin)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      setError('Incorrect PIN. Try again.')
      setTimeout(() => {
        setPin('')
        setError('')
      }, 1500)
      return
    }

    localStorage.setItem('pos_employee', JSON.stringify({
      id: data.id,
      name: data.name,
      role: data.role,
      can_apply_discounts: data.can_apply_discounts,
      can_void_sales: data.can_void_sales,
    }))

    router.push('/pos')
  }

  function pressKey(key: string) {
    if (pin.length < 4) setPin(prev => prev + key)
  }

  function deleteLast() {
    setPin(prev => prev.slice(0, -1))
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del']

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <h1 className="text-white text-2xl font-semibold">{shopName}</h1>
          <p className="text-gray-400 text-sm mt-1">Enter your PIN to start</p>
        </div>
        <div className="flex justify-center gap-4">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${
                pin.length > i ? 'bg-indigo-400 scale-110' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
        {error && (
          <p className="text-center text-red-400 text-sm">{error}</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((key, i) => {
            if (key === '') return <div key={i} />
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={deleteLast}
                  className="h-16 rounded-2xl bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 active:scale-95 transition-all"
                >
                  <Delete className="w-5 h-5" />
                </button>
              )
            }
            return (
              <button
                key={key}
                onClick={() => pressKey(key)}
                className="h-16 rounded-2xl bg-gray-700 text-white text-xl font-medium hover:bg-gray-600 active:scale-95 transition-all"
              >
                {key}
              </button>
            )
          })}
        </div>
        <div className="text-center">
          <a href="/login" className="text-gray-500 hover:text-gray-300 text-sm flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Owner login
          </a>
        </div>
      </div>
    </div>
  )
}
