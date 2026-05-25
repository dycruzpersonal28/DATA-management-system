import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useShop() {
  const [currencySymbol, setCurrencySymbol] = useState('$')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('shops')
      .select('currency_symbol')
      .single()
      .then(({ data }) => {
        if (data?.currency_symbol) setCurrencySymbol(data.currency_symbol)
      })
  }, [])

  return { currencySymbol }
}