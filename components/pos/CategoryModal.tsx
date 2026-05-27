'use client'

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { useCart } from '@/lib/hooks/useCart'
import { toast } from 'sonner'
import { useShop } from '@/lib/hooks/useShop'

interface Props {
  category: { id: string; name: string; color: string }
  items: any[]
  onClose: () => void
}

export default function CategoryModal({ category, items, onClose }: Props) {
  const [search, setSearch] = useState('')
  const { addItem } = useCart()
  const { currencySymbol } = useShop()

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items
  }, [items, search])

  function handleAdd(item: any) {
    addItem({
      itemId: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: 1,
      modifiers: [],
      trackStock: item.track_stock,
      addons: [],
    })
    toast.success(`${item.name} added`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl"
        style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ borderTop: `4px solid ${category.color || '#6366f1'}` }}>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{category.name}</h2>
            <p className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            />
          </div>
        </div>

        {/* Item list — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
              <Search className="w-8 h-8" />
              <p className="text-sm">No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleAdd(item)}
                  className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-indigo-300 hover:shadow-sm active:scale-95 transition-all"
                >
                  <div
                    className="w-full h-1 rounded-full mb-2"
                    style={{ backgroundColor: category.color || '#e5e7eb' }}
                  />
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-sm font-semibold text-indigo-600 mt-1">
                    {currencySymbol}{Number(item.price).toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
