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
