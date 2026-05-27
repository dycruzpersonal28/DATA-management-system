import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useShop() {
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [shop, setShop] = useState<any>(null)
  const [shopId, setShopId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // First check if this user is the shop owner
      const { data: ownedShop } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (ownedShop) {
        setShop(ownedShop)
        setShopId(ownedShop.id)
        if (ownedShop.currency_symbol) setCurrencySymbol(ownedShop.currency_symbol)
        return
      }

      // Otherwise look up via app_users (staff login)
      const { data: appUser } = await supabase
        .from('app_users')
        .select('shop_id')
        .eq('auth_user_id', user.id)
        .single()

      if (!appUser?.shop_id) return

      const { data: staffShop } = await supabase
        .from('shops')
        .select('*')
        .eq('id', appUser.shop_id)
        .single()

      if (staffShop) {
        setShop(staffShop)
        setShopId(staffShop.id)
        if (staffShop.currency_symbol) setCurrencySymbol(staffShop.currency_symbol)
      }
    }

    load()
  }, [])

  return { currencySymbol, shop, shopId }
}