'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import Cart from '@/components/pos/Cart'
import CategoryModal from '@/components/pos/CategoryModal'
import { ShoppingCart, ArrowLeft, Tag } from 'lucide-react'
import Link from 'next/link'

export default function POSPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null)
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

  // Items grouped by category for the modal
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const item of items) {
      const cid = item.category_id
      if (!cid) continue
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid)!.push(item)
    }
    return map
  }, [items])

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Left: Category grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-gray-900">POS Terminal</h1>
        </div>

        {/* Category grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading...
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <Tag className="w-10 h-10" />
              <p>No categories found</p>
              <Link href="/categories" className="text-indigo-600 text-sm hover:underline">
                Add categories in back office
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {categories.map(cat => {
                const count = itemsByCategory.get(cat.id)?.length ?? 0
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat)}
                    className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:shadow-md active:scale-95 transition-all group"
                  >
                    {/* Color accent */}
                    <div
                      className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: cat.color || '#6366f1' }}
                      />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                      {cat.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {count} item{count !== 1 ? 's' : ''}
                    </p>
                    {/* Bottom color bar */}
                    <div
                      className="w-full h-1 rounded-full mt-3 opacity-60"
                      style={{ backgroundColor: cat.color || '#6366f1' }}
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <Cart />
      </div>

      {/* Category modal */}
      {selectedCategory && (
        <CategoryModal
          category={selectedCategory}
          items={itemsByCategory.get(selectedCategory.id) || []}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </div>
  )
}
