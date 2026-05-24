import { create } from 'zustand'
import { CartItem } from '@/lib/types/database'

interface CartState {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  discountAmount: number
  discountLabel: string
  addItem: (item: Omit<CartItem, 'id' | 'lineTotal'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateNote: (id: string, note: string) => void
  setCustomer: (id: string | null, name: string | null) => void
  setDiscount: (amount: number, label: string) => void
  clearCart: () => void
  subtotal: () => number
  total: () => number
  itemCount: () => number
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  discountAmount: 0,
  discountLabel: '',

  addItem: (item) =>
    set((state) => {
      const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0)
      const unitPrice = item.price + modTotal
      const lineTotal = unitPrice * item.quantity

      const existingIdx = state.items.findIndex(
        (i) =>
          i.itemId === item.itemId &&
          i.variantId === item.variantId &&
          JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers)
      )

      if (existingIdx >= 0) {
        const updated = [...state.items]
        const ex = updated[existingIdx]
        const newQty = ex.quantity + item.quantity
        updated[existingIdx] = {
          ...ex,
          quantity: newQty,
          lineTotal: unitPrice * newQty,
        }
        return { items: updated }
      }

      return {
        items: [
          ...state.items,
          { ...item, id: crypto.randomUUID(), lineTotal },
        ],
      }
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  updateQuantity: (id, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.id !== id)
          : state.items.map((i) =>
              i.id === id
                ? { ...i, quantity, lineTotal: i.price * quantity }
                : i
            ),
    })),

  updateNote: (id, note) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, note } : i)),
    })),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  setDiscount: (amount, label) =>
    set({ discountAmount: amount, discountLabel: label }),
  clearCart: () =>
    set({
      items: [],
      customerId: null,
      customerName: null,
      discountAmount: 0,
      discountLabel: '',
    }),

  subtotal: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
  total: () => Math.max(0, get().subtotal() - get().discountAmount),
  itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
}))
