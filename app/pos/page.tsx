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
  const [currencySymbol, setCurrencySymbol] = useState<string>('₱')
  const { itemCount } = useCart()

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id, currency_symbol').single()
      if (!shop) return
      setCurrencySymbol(shop.currency_symbol || '₱')

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('shop_id', shop.id)
        .order('sort_order')

      const { data: itms } = await supabase
        .from('items')
        .select('*, categories(name, color), level:item_levels(id, is_sellable)')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('name')

      setCategories(cats || [])
      setItems((itms || []).filter((i: any) => i.level?.is_sellable === true))
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
            <ItemGrid items={filteredItems} currencySymbol={currencySymbol} />
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <Cart currencySymbol={currencySymbol} />
      </div>
    </div>
  )
}
