'use client'

import { create } from 'zustand'

export interface AddonLine {
  id: string
  name: string
  price: number
  quantity: number
}

export interface CartItem {
  id: string
  itemId: string
  variantId?: string
  name: string
  variantName?: string
  price: number
  quantity: number
  modifiers: { name: string; price: number }[]
  addons: AddonLine[]
  note?: string
  lineTotal: number
  trackStock: boolean
}

interface CartState {
  items: CartItem[]
  customerId: string | null
  discountAmount: number
  addItem: (item: Omit<CartItem, 'id' | 'lineTotal'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  clearCart: () => void
  setCustomer: (id: string | null) => void
  setDiscount: (amount: number) => void
  loadItems: (items: CartItem[]) => void
  subtotal: () => number
  total: () => number
}

function calcLineTotal(item: Omit<CartItem, 'id' | 'lineTotal'>): number {
  const addonsTotal = (item.addons || []).reduce((s, a) => s + a.price * a.quantity, 0)
  return (item.price + addonsTotal) * item.quantity
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  discountAmount: 0,

  addItem: (item) => {
    const id = crypto.randomUUID()
    const lineTotal = calcLineTotal(item)
    set(s => ({ items: [...s.items, { ...item, id, lineTotal, addons: item.addons || [] }] }))
  },

  removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  updateQuantity: (id, qty) => {
    if (qty <= 0) { get().removeItem(id); return }
    set(s => ({
      items: s.items.map(i => i.id === id
        ? { ...i, quantity: qty, lineTotal: calcLineTotal({ ...i, quantity: qty }) }
        : i
      )
    }))
  },

  loadItems: (items) => set({ items }),
  clearCart: () => set({ items: [], customerId: null, discountAmount: 0 }),
  setCustomer: (id) => set({ customerId: id }),
  setDiscount: (amount) => set({ discountAmount: amount }),

  subtotal: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
  total: () => {
    const sub = get().subtotal()
    return Math.max(0, sub - get().discountAmount)
  },
}))
