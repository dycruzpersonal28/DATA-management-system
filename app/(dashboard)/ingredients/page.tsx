'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Search, ChevronDown, ChevronRight, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

interface Level { id: string; name: string; order_index: number; description: string }
interface Product { id: string; name: string; code: string; level_id: string; unit: string; cost_price: number; sell_price: number; stock_quantity: number; is_active: boolean; product_levels?: { name: string } }
interface Ingredient { id: string; ingredient_id: string; quantity: number; products?: { id: string; name: string; unit: string; code: string } }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function BOMEditor({ product, allProducts, onClose }: { product: Product; allProducts: Product[]; onClose: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selId, setSelId] = useState('')
  const [qty, setQty] = useState('1')
  const [loading, setLoading] = useState(true)

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from('product_ingredients')
      .select('*, products:ingredient_id(id, name, unit, code)')
      .eq('product_id', product.id)
    setIngredients(data || [])
    setLoading(false)
  }, [product.id])

  useEffect(() => { fetchIngredients() }, [fetchIngredients])

  const available = allProducts.filter(p => p.id !== product.id && !ingredients.find(i => i.ingredient_id === p.id))

  async function addIngredient() {
    if (!selId || !qty) return
    const { error } = await supabase.from('product_ingredients').insert({ product_id: product.id, ingredient_id: selId, quantity: parseFloat(qty) })
    if (error) { toast.error(error.message); return }
    toast.success('Ingredient added')
    setSelId(''); setQty('1'); fetchIngredients()
  }

  async function removeIngredient(id: string) {
    await supabase.from('product_ingredients').delete().eq('id', id)
    fetchIngredients()
  }

  return (
    <Modal title={`BOM: ${product.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500">Define what <strong>{product.name}</strong> is made of. Ingredients can be products at any level.</p>
      {loading ? <div className="text-center text-gray-400 py-4">Loading...</div> : (
        <div className="space-y-2">
          {ingredients.length === 0 && <div className="text-gray-400 text-sm text-center py-3">No ingredients yet</div>}
          {ingredients.map(ing => (
            <div key={ing.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm font-medium text-gray-900">{ing.products?.name}</span>
              <span className="text-xs text-purple-600 font-mono">{ing.quantity} {ing.products?.unit}</span>
              <button onClick={() => removeIngredient(ing.id)} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <select value={selId} onChange={e => setSelId(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select ingredient...</option>
          {available.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_levels?.name || 'No level'})</option>)}
        </select>
        <Input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0.001" step="any" placeholder="Qty" className="w-20" />
        <Button onClick={addIngredient}>Add</Button>
      </div>
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

export default function IngredientsPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [bomProduct, setBomProduct] = useState<Product | null>(null)
  const [showLevelForm, setShowLevelForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())

  // Level form state
  const [levelName, setLevelName] = useState('')
  const [levelDesc, setLevelDesc] = useState('')

  // Product form state
  const [pName, setPName] = useState('')
  const [pCode, setPCode] = useState('')
  const [pUnit, setPUnit] = useState('units')
  const [pCost, setPCost] = useState('')
  const [pSell, setPSell] = useState('')
  const [pLevelId, setPLevelId] = useState('')

  const fetchAll = useCallback(async () => {
    const [{ data: lvls }, { data: prods }] = await Promise.all([
      supabase.from('product_levels').select('*').order('order_index'),
      supabase.from('products').select('*, product_levels(name)').order('name'),
    ])
    setLevels(lvls || [])
    setProducts(prods || [])
    setLoading(false)
    // Expand all levels by default
    setExpandedLevels(new Set((lvls || []).map((l: Level) => l.id)))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function saveLevel() {
    if (!levelName.trim()) { toast.error('Level name required'); return }
    const maxOrder = levels.length ? Math.max(...levels.map(l => l.order_index)) + 1 : 1
    const { error } = await supabase.from('product_levels').insert({ name: levelName, description: levelDesc, order_index: maxOrder })
    if (error) { toast.error(error.message); return }
    toast.success('Level created')
    setLevelName(''); setLevelDesc(''); setShowLevelForm(false); fetchAll()
  }

  async function deleteLevel(id: string) {
    if (!confirm('Delete this level? Products using it will become unassigned.')) return
    await supabase.from('product_levels').delete().eq('id', id)
    toast.success('Level deleted'); fetchAll()
  }

  function openProductForm(product?: Product, levelId?: string) {
    setEditingProduct(product || null)
    setPName(product?.name || '')
    setPCode(product?.code || '')
    setPUnit(product?.unit || 'units')
    setPCost(String(product?.cost_price || ''))
    setPSell(String(product?.sell_price || ''))
    setPLevelId(product?.level_id || levelId || '')
    setShowProductForm(true)
  }

  async function saveProduct() {
    if (!pName.trim() || !pLevelId) { toast.error('Name and level required'); return }
    const payload = { name: pName, code: pCode || null, level_id: pLevelId, unit: pUnit, cost_price: parseFloat(pCost) || 0, sell_price: parseFloat(pSell) || 0 }
    if (editingProduct) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id)
      toast.success('Product updated')
    } else {
      await supabase.from('products').insert({ ...payload, stock_quantity: 0 })
      toast.success('Product created')
    }
    setShowProductForm(false); fetchAll()
  }

  async function handleDelete() {
    if (!confirm(`Delete ${selected.size} product(s)?`)) return
    await supabase.from('products').delete().in('id', [...selected])
    toast.success('Deleted'); setSelected(new Set()); fetchAll()
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === filteredProducts.length) setSelected(new Set())
    else setSelected(new Set(filteredProducts.map(p => p.id)))
  }

  function toggleLevel(id: string) {
    setExpandedLevels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchProduct = productFilter ? p.id === productFilter : true
    return matchSearch && matchProduct
  })

  // Get the highest order_index level (Final Product)
  const maxOrder = levels.length ? Math.max(...levels.map(l => l.order_index)) : -1
  const finalLevelId = levels.find(l => l.order_index === maxOrder)?.id

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Ingredients / BOM</h1>
        <p className="text-sm text-gray-500 mt-1">Define product levels and build your bill of materials. Only Final Products are sellable in POS.</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowLevelForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Add Level
          </Button>
          <Button size="sm" variant="outline" onClick={() => openProductForm()}>
            <Plus className="w-4 h-4 mr-1.5" />Add Product
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete ({selected.size})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-44" />
          </div>
        </div>
      </div>

      {/* Level form */}
      {showLevelForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">New Level</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input value={levelName} onChange={e => setLevelName(e.target.value)} placeholder="Level name (e.g. Raw Material)" />
            <Input value={levelDesc} onChange={e => setLevelDesc(e.target.value)} placeholder="Description (optional)" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveLevel}>Create Level</Button>
            <Button size="sm" variant="outline" onClick={() => setShowLevelForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : levels.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-medium">No levels yet</p>
          <p className="text-gray-400 text-sm mt-1">Start by creating levels like Raw Material, Level 2, Level 1, Final Product</p>
          <Button className="mt-4" onClick={() => setShowLevelForm(true)}><Plus className="w-4 h-4 mr-2" />Add Level</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select all */}
          {filteredProducts.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <input type="checkbox" checked={selected.size === filteredProducts.length && filteredProducts.length > 0} onChange={toggleAll} className="rounded" />
              <span className="text-xs text-gray-500">Select all ({filteredProducts.length})</span>
            </div>
          )}

          {levels.map(level => {
            const levelProducts = filteredProducts.filter(p => p.level_id === level.id)
            const isExpanded = expandedLevels.has(level.id)
            const isFinal = level.id === finalLevelId

            return (
              <div key={level.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Level header */}
                <div className={`flex items-center justify-between px-4 py-3 cursor-pointer ${isFinal ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-gray-50 border-b border-gray-100'}`}
                  onClick={() => toggleLevel(level.id)}>
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className={`text-sm font-semibold ${isFinal ? 'text-indigo-700' : 'text-gray-700'}`}>{level.name}</span>
                    {isFinal && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">Final Product - POS Sellable</span>}
                    <span className="text-xs text-gray-400">{levelProducts.length} products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openProductForm(undefined, level.id) }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add product
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteLevel(level.id) }}
                      className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Products in this level */}
                {isExpanded && (
                  <div className="divide-y divide-gray-50">
                    {levelProducts.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-gray-400 text-center">No products in this level</div>
                    ) : (
                      levelProducts.map(prod => (
                        <div key={prod.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${selected.has(prod.id) ? 'bg-indigo-50' : ''}`}>
                          <input type="checkbox" checked={selected.has(prod.id)} onChange={() => toggleSelect(prod.id)} className="rounded" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{prod.name}</p>
                            <div className="flex gap-3 mt-0.5">
                              {prod.code && <span className="text-xs text-gray-400">SKU: {prod.code}</span>}
                              <span className="text-xs text-gray-400">{prod.unit}</span>
                              {prod.cost_price > 0 && <span className="text-xs text-gray-400">Cost: ${prod.cost_price.toFixed(2)}</span>}
                              {isFinal && prod.sell_price > 0 && <span className="text-xs text-indigo-600 font-medium">Sell: ${prod.sell_price.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setBomProduct(prod)}
                              className="text-xs border border-gray-200 text-gray-600 hover:border-purple-400 hover:text-purple-600 px-2 py-1 rounded-lg transition-colors">
                              BOM
                            </button>
                            <button onClick={() => openProductForm(prod)} className="text-gray-400 hover:text-indigo-600">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Product form modal */}
      {showProductForm && (
        <Modal title={editingProduct ? 'Edit Product' : 'New Product'} onClose={() => setShowProductForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-gray-600">Product Name *</label>
              <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Coffee Blend A" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Code / SKU</label>
              <Input value={pCode} onChange={e => setPCode(e.target.value)} placeholder="e.g. PRD-001" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Unit</label>
              <Input value={pUnit} onChange={e => setPUnit(e.target.value)} placeholder="units / ml / g" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-gray-600">Level *</label>
              <select value={pLevelId} onChange={e => setPLevelId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select level...</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}{l.id === finalLevelId ? ' (Final Product)' : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Cost Price</label>
              <Input value={pCost} onChange={e => setPCost(e.target.value)} type="number" placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Sell Price</label>
              <Input value={pSell} onChange={e => setPSell(e.target.value)} type="number" placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Button onClick={saveProduct}>{editingProduct ? 'Update' : 'Create'} Product</Button>
            <Button variant="outline" onClick={() => setShowProductForm(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* BOM editor modal */}
      {bomProduct && (
        <BOMEditor product={bomProduct} allProducts={products} onClose={() => { setBomProduct(null); fetchAll() }} />
      )}
    </div>
  )
}
