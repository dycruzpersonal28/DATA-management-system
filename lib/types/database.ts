// ── Core shop ────────────────────────────────────────────────────────────────
export interface Shop {
  id: string
  owner_id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  currency: string
  currency_symbol: string
  timezone: string
  tax_inclusive: boolean
  loyalty_enabled: boolean
  kds_enabled: boolean
  printer_enabled: boolean
  logo_url: string | null
  receipt_header: string | null
  receipt_footer: string | null
  points_per_dollar: number
  points_redemption_rate: number
  // Feature flags (Batch 6)
  feature_shifts: boolean
  feature_dining_options: boolean
  feature_open_tickets: boolean
  created_at: string
  updated_at: string
}

// ── Staff ─────────────────────────────────────────────────────────────────────
export interface Employee {
  id: string
  shop_id: string
  name: string
  email: string | null
  pin: string
  role: 'owner' | 'manager' | 'cashier'
  is_active: boolean
  can_apply_discounts: boolean
  can_void_sales: boolean
  can_view_reports: boolean
  can_manage_inventory: boolean
  created_at: string
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
export interface Category {
  id: string
  shop_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface ItemLevel {
  id: string
  shop_id: string
  name: string
  sort_order: number
  is_sellable: boolean
  created_at: string
}

export interface ItemIngredient {
  id: string
  shop_id: string
  item_id: string
  ingredient_id: string
  quantity: number
  created_at: string
  ingredient?: Item
}

export interface Item {
  id: string
  shop_id: string
  category_id: string | null
  level_id: string | null
  name: string
  description: string | null
  price: number
  cost: number
  sku: string | null
  barcode: string | null
  image_url: string | null
  track_stock: boolean
  is_active: boolean
  is_composite: boolean
  sold_by_weight: boolean
  tax_rate: number
  created_at: string
  updated_at: string
  // joined
  categories?: Category
  level?: ItemLevel
  inventory_levels?: InventoryLevel[]
  ingredients?: ItemIngredient[]
}

export interface InventoryLevel {
  id: string
  shop_id: string
  item_id: string
  variant_id: string | null
  quantity: number
  low_stock_alert: number
}

// ── Customers ─────────────────────────────────────────────────────────────────
export interface Customer {
  id: string
  shop_id: string
  name: string
  email: string | null
  phone: string | null
  loyalty_points: number
  total_visits: number
  total_spent: number
  birthday: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Sales ─────────────────────────────────────────────────────────────────────
export interface PaymentType {
  id: string
  shop_id: string
  name: string
  is_active: boolean
  sort_order: number
}

export interface Receipt {
  id: string
  shop_id: string
  employee_id: string | null
  customer_id: string | null
  receipt_number: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_type_id: string | null
  amount_tendered: number | null
  change_amount: number | null
  loyalty_points_earned: number
  loyalty_points_redeemed: number
  note: string | null
  status: 'completed' | 'voided' | 'refunded'
  created_at: string
  // joined
  employees?: Employee
  customers?: Customer
  payment_types?: PaymentType
  receipt_items?: ReceiptItem[]
}

export interface ReceiptItem {
  id: string
  receipt_id: string
  item_id: string | null
  variant_id: string | null
  item_name: string
  variant_name: string | null
  unit_price: number
  quantity: number
  discount_amount: number
  tax_amount: number
  line_total: number
  modifiers: { name: string; price: number }[]
  note: string | null
}

// ── Cart (client-side only) ───────────────────────────────────────────────────
export interface CartItem {
  id: string
  itemId: string
  variantId?: string
  name: string
  variantName?: string
  price: number
  quantity: number
  modifiers: { name: string; price: number }[]
  note?: string
  lineTotal: number
  trackStock: boolean
}

// ── Dining Options (Batch 6) ──────────────────────────────────────────────────
export interface DiningOption {
  id: string
  shop_id: string
  name: string
  is_active: boolean
  sort_order: number
  created_at: string
}

// ── Shifts (Batch 6) ──────────────────────────────────────────────────────────
export interface Shift {
  id: string
  shop_id: string
  employee_id: string | null
  opening_cash: number
  closing_cash: number | null
  status: 'open' | 'closed'
  note: string | null
  started_at: string
  ended_at: string | null
  created_at: string
  // joined
  employees?: Employee
}

export interface ShiftCashMovement {
  id: string
  shift_id: string
  shop_id: string
  type: 'cash_in' | 'cash_out'
  amount: number
  note: string | null
  created_at: string
}

// ── Open Tickets / Saved Carts (Batch 6) ─────────────────────────────────────
export interface OpenTicket {
  id: string
  shop_id: string
  name: string | null
  cart_items: CartItem[]
  dining_option_id: string | null
  dining_option_name: string | null
  total: number
  item_count: number
  created_at: string
}
