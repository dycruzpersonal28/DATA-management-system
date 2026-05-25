'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/hooks/useCart'
import { useShop } from '@/lib/hooks/useShop'
import Cart from '@/components/pos/Cart'
import { ArrowLeft, Tag, ChevronLeft, Search, LayoutGrid, List } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function POSPage() {
  const supabase = createClient()
  const { addItem } = useCart()
  const { currencySymbol } = useShop()

  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [userName, setUserName] = useState('')
  const [now, setNow] = useState(new Date())

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  // Load user + shop data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        setUserName(profile?.full_name || user.email?.split('@')[0] || 'there')
      }

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

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return categories
    return categories.filter(c => c.name.toLowerCase().includes(q))
  }, [categories, search])

  const categoryItems = useMemo(() => {
    const base = selectedCategory ? itemsByCategory.get(selectedCategory.id) || [] : []
    const q = search.toLowerCase().trim()
    if (!q) return base
    return base.filter((i: any) => i.name.toLowerCase().includes(q))
  }, [selectedCategory, itemsByCategory, search])

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
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">

          {/* Back button */}
          {selectedCategory ? (
            <button
              onClick={() => { setSelectedCategory(null); setSearch('') }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}

          {/* Clock + greeting */}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-xs text-gray-400">{formattedDate} · {formattedTime}</span>
            <span className="text-sm font-semibold text-gray-800 truncate">
              Hi, {userName}
              {selectedCategory && (
                <span className="text-gray-400 font-normal"> · {selectedCategory.name}</span>
              )}
            </span>
          </div>

          <div className="flex-1" />

          {/* Search bar */}
          <div className="relative w-48 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder={selectedCategory ? 'Search items...' : 'Search categories...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            />
          </div>

          {/* Grid / List toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>

          ) : !selectedCategory ? (
            /* Category view */
            filteredCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Tag className="w-10 h-10" />
                <p>{search ? 'No categories match your search' : 'No categories found'}</p>
                {!search && (
                  <Link href="/categories" className="text-indigo-600 text-sm hover:underline">
                    Add categories in back office
                  </Link>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-3 gap-4">
                {filteredCategories.map(cat => {
                  const count = itemsByCategory.get(cat.id)?.length ?? 0
                  return (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategory(cat); setSearch('') }}
                      className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:shadow-md active:scale-95 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
                        style={{ backgroundColor: `${cat.color}20` }}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                        {cat.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{count} item{count !== 1 ? 's' : ''}</p>
                      <div className="w-full h-1 rounded-full mt-3 opacity-60"
                        style={{ backgroundColor: cat.color || '#6366f1' }} />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCategories.map(cat => {
                  const count = itemsByCategory.get(cat.id)?.length ?? 0
                  return (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategory(cat); setSearch('') }}
                      className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 hover:shadow-sm active:scale-[0.99] transition-all group text-left"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${cat.color}20` }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                          {cat.name}
                        </p>
                        <p className="text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="w-16 h-1 rounded-full opacity-60"
                        style={{ backgroundColor: cat.color || '#6366f1' }} />
                    </button>
                  )
                })}
              </div>
            )

          ) : (
            /* Items view */
            categoryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Tag className="w-10 h-10" />
                <p>{search ? 'No items match your search' : 'No items in this category'}</p>
                {!search && (
                  <Link href="/items" className="text-indigo-600 text-sm hover:underline">
                    Add items in back office
                  </Link>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-3 gap-4">
                {categoryItems.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item)}
                    className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-indigo-300 hover:shadow-sm active:scale-95 transition-all"
                  >
                    <div className="w-full h-1 rounded-full mb-2"
                      style={{ backgroundColor: selectedCategory.color || '#e5e7eb' }} />
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-sm font-semibold text-indigo-600 mt-1">
                      {currencySymbol}{Number(item.price).toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {categoryItems.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item)}
                    className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm active:scale-[0.99] transition-all text-left"
                  >
                    <div className="w-2 self-stretch rounded-full flex-shrink-0"
                      style={{ backgroundColor: selectedCategory.color || '#6366f1' }} />
                    <p className="flex-1 text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-sm font-semibold text-indigo-600 flex-shrink-0">
                      {currencySymbol}{Number(item.price).toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            )
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
