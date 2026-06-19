'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, Printer, ChevronDown, ChevronUp, Wifi, Network, Bluetooth, ScanLine } from 'lucide-react'
import { requestBlePrinter } from '@/lib/printing/blePrinter'

type PrinterGroup = {
  id: string
  name: string
  printer_type: string
  printer_address: string
  is_active: boolean
  sort_order: number
  paper_width: number
  show_amounts: boolean
  show_ingredients: boolean
  categories?: string[]
}

// ── Bluetooth scanner ─────────────────────────────────────────────────────────
// Uses the native BLE plugin when running in the Android app (required —
// Web Bluetooth doesn't work inside the Capacitor WebView), with a Web
// Bluetooth fallback for desktop testing. Works with any generic ESC/POS
// BLE thermal printer, not one specific brand.
async function scanAndPairBluetooth(): Promise<string | null> {
  try {
    const device = await requestBlePrinter()
    if (!device) return null
    toast.success(`Paired: ${device.name}`)
    return device.deviceId
  } catch (err: any) {
    toast.error(err?.message || 'Bluetooth pairing failed')
    return null
  }
}

// ── Printer Group Form ────────────────────────────────────────────────────────
function PrinterGroupForm({
  initial,
  categories,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<PrinterGroup>
  categories: any[]
  onSave: (data: any) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    printer_type: initial?.printer_type || 'network',
    printer_address: initial?.printer_address || '',
    paper_width: initial?.paper_width ?? 57,
    show_amounts: initial?.show_amounts ?? false,
    show_ingredients: initial?.show_ingredients ?? true,
  })
  const [selectedCats, setSelectedCats] = useState<string[]>(initial?.categories || [])
  const [btScanning, setBtScanning] = useState(false)

  function toggleCat(id: string) {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function handleBtScan() {
    setBtScanning(true)
    const deviceName = await scanAndPairBluetooth()
    if (deviceName) {
      setForm(p => ({ ...p, printer_address: deviceName }))
    }
    setBtScanning(false)
  }

  const connectionTypes = [
    { v: 'network', label: 'Network (LAN)', icon: Network },
    { v: 'wifi',    label: 'Wi-Fi',         icon: Wifi },
    { v: 'bluetooth', label: 'Bluetooth',   icon: Bluetooth },
  ]

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl flex flex-col max-h-[80vh]">
      <div className="flex gap-2 p-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex-shrink-0">
        <Button size="sm" disabled={loading} onClick={() => onSave({ ...form, categories: selectedCats })}>
          <Check className="w-3.5 h-3.5 mr-1.5" /> Save Printer Group
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
        </Button>
      </div>
      <div className="overflow-y-auto flex-1 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Printer Group Name</label>
          <Input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Kitchen, Bar, Grill"
          />
        </div>
        <div>
          {form.printer_type === 'bluetooth' ? (
            <>
              <label className="text-xs font-medium text-gray-500 block mb-1">Paired Device</label>
              <div className="flex gap-2">
                <Input
                  value={form.printer_address}
                  readOnly
                  placeholder="No device paired yet"
                  className="bg-white text-gray-500 text-sm"
                />
                <button
                  type="button"
                  onClick={handleBtScan}
                  disabled={btScanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors flex-shrink-0"
                >
                  {btScanning ? (
                    <span className="animate-pulse">Scanning…</span>
                  ) : (
                    <><ScanLine className="w-3.5 h-3.5" /> Scan</>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Make sure your printer is powered on and in pairing mode</p>
            </>
          ) : (
            <>
              <label className="text-xs font-medium text-gray-500 block mb-1">IP Address / Port</label>
              <Input
                value={form.printer_address}
                onChange={e => setForm(p => ({ ...p, printer_address: e.target.value }))}
                placeholder="e.g. 192.168.1.100:9100"
              />
            </>
          )}
        </div>
      </div>

      {/* Connection type */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">Connection Type</label>
        <div className="flex gap-2">
          {connectionTypes.map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setForm(p => ({ ...p, printer_type: v, printer_address: v !== p.printer_type ? '' : p.printer_address }))
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                form.printer_type === v
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        {form.printer_type === 'bluetooth' && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2.5 bg-blue-50 rounded-xl border border-blue-100">
            <Bluetooth className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Tap <strong>Scan</strong> to pair any Bluetooth ESC/POS thermal printer. Make sure it's powered on and discoverable nearby.
            </p>
          </div>
        )}
      </div>

      {/* Categories */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">
          Assigned Categories{' '}
          <span className="text-gray-300 font-normal">(items from these categories will print here)</span>
        </label>
        {categories.length === 0 ? (
          <p className="text-xs text-gray-400">No categories found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCat(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                  selectedCats.includes(cat.id)
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#6366f1' }} />
                <span className="truncate text-xs font-medium">{cat.name}</span>
                {selectedCats.includes(cat.id) && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Paper size */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">Paper Width</label>
        <div className="flex gap-2">
          {[57, 80].map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setForm(p => ({ ...p, paper_width: w }))}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                form.paper_width === w
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {w}mm
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Match this to the paper roll loaded in the printer</p>
      </div>

      {/* Print options toggles */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Print Options</label>
        <div className="space-y-2">
          <label className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 transition-colors">
            <div>
              <p className="text-sm font-medium text-gray-700">Show item amounts</p>
              <p className="text-[11px] text-gray-400">Print price alongside each item on the kitchen ticket</p>
            </div>
            <div
              onClick={() => setForm(p => ({ ...p, show_amounts: !p.show_amounts }))}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.show_amounts ? 'bg-indigo-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.show_amounts ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
          </label>
          <label className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 transition-colors">
            <div>
              <p className="text-sm font-medium text-gray-700">Show ingredients</p>
              <p className="text-[11px] text-gray-400">Print ingredient breakdown under each item</p>
            </div>
            <div
              onClick={() => setForm(p => ({ ...p, show_ingredients: !p.show_ingredients }))}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.show_ingredients ? 'bg-indigo-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.show_ingredients ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
          </label>
        </div>
      </div>

      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KitchenPrintersPage() {
  const supabase = createClient()
  const [groups, setGroups] = useState<PrinterGroup[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [shopId, setShopId] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) return
      setShopId(shop.id)

      const [{ data: grps }, { data: cats }, { data: pgc }] = await Promise.all([
        supabase.from('printer_groups').select('*').eq('shop_id', shop.id).order('sort_order'),
        supabase.from('categories').select('*').eq('shop_id', shop.id).order('name'),
        supabase.from('printer_group_categories').select('*'),
      ])

      const catMap = new Map<string, string[]>()
      for (const row of (pgc || [])) {
        if (!catMap.has(row.printer_group_id)) catMap.set(row.printer_group_id, [])
        catMap.get(row.printer_group_id)!.push(row.category_id)
      }

      setGroups((grps || []).map(g => ({ ...g, categories: catMap.get(g.id) || [] })))
      setCategories(cats || [])
    }
    load()
  }, [])

  async function handleSave(data: any, id?: string) {
    if (!data.name.trim()) return toast.error('Name required')
    setLoading(true)

    if (id) {
      const { error } = await supabase.from('printer_groups').update({
        name: data.name,
        printer_type: data.printer_type,
        printer_address: data.printer_address,
        paper_width: data.paper_width,
        show_amounts: data.show_amounts,
        show_ingredients: data.show_ingredients,
      }).eq('id', id)
      if (error) { toast.error('Failed'); setLoading(false); return }

      await supabase.from('printer_group_categories').delete().eq('printer_group_id', id)
      if (data.categories.length > 0) {
        await supabase.from('printer_group_categories').insert(
          data.categories.map((cid: string) => ({ printer_group_id: id, category_id: cid }))
        )
      }

      setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g))
      toast.success('Updated')
      setEditingId(null)
    } else {
      const { data: row, error } = await supabase.from('printer_groups')
        .insert({
          shop_id: shopId,
          name: data.name,
          printer_type: data.printer_type,
          printer_address: data.printer_address,
          paper_width: data.paper_width,
          show_amounts: data.show_amounts,
          show_ingredients: data.show_ingredients,
          is_active: true,
          sort_order: groups.length,
        })
        .select().single()
      if (error) { toast.error('Failed'); setLoading(false); return }

      if (data.categories.length > 0) {
        await supabase.from('printer_group_categories').insert(
          data.categories.map((cid: string) => ({ printer_group_id: row.id, category_id: cid }))
        )
      }

      setGroups(prev => [...prev, { ...row, categories: data.categories }])
      toast.success('Printer group added')
      setAdding(false)
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('printer_groups').delete().eq('id', id)
    setGroups(prev => prev.filter(g => g.id !== id))
    toast.success('Deleted')
  }

  async function handleToggle(g: PrinterGroup) {
    const val = !g.is_active
    await supabase.from('printer_groups').update({ is_active: val }).eq('id', g.id)
    setGroups(prev => prev.map(p => p.id === g.id ? { ...p, is_active: val } : p))
  }

  const catName = (id: string) => categories.find(c => c.id === id)?.name || id

  const typeLabel: Record<string, string> = {
    network: 'Network (LAN)',
    wifi: 'Wi-Fi',
    bluetooth: 'Bluetooth',
  }
  const typeIcon: Record<string, any> = {
    network: Network,
    wifi: Wifi,
    bluetooth: Bluetooth,
  }

  return (
    <div className="h-full overflow-y-auto p-4 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Kitchen Printers</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set up printer groups and assign categories. Items will print to their assigned printer after each sale, including ingredients.
        </p>
      </div>

      {adding && (
        <div className="mb-5">
          <PrinterGroupForm
            categories={categories}
            onSave={data => handleSave(data)}
            onCancel={() => setAdding(false)}
            loading={loading}
          />
        </div>
      )}

      {!adding && (
        <Button variant="outline" size="sm" className="mb-5" onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Printer Group
        </Button>
      )}

      <div className="space-y-3">
        {groups.length === 0 && !adding && (
          <div className="text-center py-10 text-gray-400">
            <Printer className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No printer groups yet.</p>
          </div>
        )}

        {groups.map(g => {
          const TypeIcon = typeIcon[g.printer_type] || Network
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {editingId === g.id ? (
                <div className="p-4">
                  <PrinterGroupForm
                    initial={g}
                    categories={categories}
                    onSave={data => handleSave(data, g.id)}
                    onCancel={() => setEditingId(null)}
                    loading={loading}
                  />
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${g.is_active ? 'bg-orange-100' : 'bg-gray-100'}`}>
                      <Printer className={`w-4 h-4 ${g.is_active ? 'text-orange-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${g.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{g.name}</p>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                          <TypeIcon className="w-3 h-3" />
                          {typeLabel[g.printer_type] || g.printer_type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {g.printer_address || 'No address set'} · {(g.categories?.length || 0)} categor{g.categories?.length === 1 ? 'y' : 'ies'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(g)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          g.is_active
                            ? 'bg-green-50 text-green-600 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {g.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => { setEditingId(g.id); setAdding(false) }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(g.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
                        {expandedId === g.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {expandedId === g.id && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Assigned Categories</p>
                        {(g.categories?.length || 0) === 0 ? (
                          <p className="text-xs text-gray-400">No categories assigned. Edit to assign categories.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {g.categories!.map(cid => (
                              <span key={cid} className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 font-medium">
                                {catName(cid)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Connection</p>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <TypeIcon className="w-3.5 h-3.5" />
                          {typeLabel[g.printer_type] || g.printer_type}
                          {g.printer_address && <span className="text-gray-400">· {g.printer_address}</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Paper Width</p>
                        <p className="text-xs text-gray-500">{(g as any).paper_width ?? 57}mm</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Print includes</p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-xs text-gray-600">Item name</span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-xs text-gray-600">Quantity</span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-xs text-gray-600">Notes</span>
                          {(g as any).show_ingredients !== false && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-600">Ingredients ✓</span>
                          )}
                          {(g as any).show_amounts && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-600">Amounts ✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
