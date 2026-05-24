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
  created_at: string
  updated_at: string
}

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

export interface Category {
  id: string
  shop_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

// NEW: item level (Raw, Level 1, Level 2, Final Product, etc.)
export interface ItemLevel {
  id: string
  shop_id: string
  name: string
  sort_order: number
  is_sellable: boolean   // true = shows on POS
  created_at: string
}

// NEW: one BOM row linking a composite item to an ingredient
export interface ItemIngredient {
  id: string
  shop_id: string
  item_id: string        // the composite/parent item
  ingredient_id: string  // the component item
  quantity: number
  created_at: string
  // joined
  ingredient?: Item
}

export interface Item {
  id: string
  shop_id: string
  category_id: string | null
  level_id: string | null        // NEW
  name: string
  description: string | null
  price: number
  cost: number
  sku: string | null
  barcode: string | null
  image_url: string | null
  track_stock: boolean
  is_active: boolean
  is_composite: boolean          // NEW
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

export interface PaymentType {
  id: string
  shop_id: string
  name: string
  is_active: boolean
  sort_order: number
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
  note?: string
  lineTotal: number
  trackStock: boolean
}
