'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, X, Monitor } from 'lucide-react'
import { toast } from 'sonner'

type Category = { id: string; name: string; color: string }
type KdsStation = {
  id: string
  name: string
  is_active: boolean
  show_receipt: boolean
  sort_order: number
  kds_station_categories: { category_id: string }[]
}

export default function KdsStationsPage() {
  const supabase = createClient()
  const [stations, setStations] = useState<KdsStation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [shopId, setShopId] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingStation, setEditingStation] = useState<KdsStation | null | undefined>(undefined)

  async function loadData() {
    setLoading(true)
    const { data: shop } = await supabase.from('shops').select('id').single()
    if (!shop) { setLoading(false); return }
    setShopId(shop.id)

    const [{ data: stns }, { data: cats }] = await Promise.all([
      supabase
        .from('kds_stations')
        .select('*, kds_station_categories(category_id)')
        .eq('shop_id', shop.id)
        .order('sort_order'),
      supabase
        .from('categories')
        .select('id, name, color')
        .eq('shop_id', shop.id)
        .order('name'),
    ])
    setStations(stns ?? [])
    setCategories(cats ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Kitchen Display Stations</h1>
          <p className="text-sm text-gray-400 mt-0.5">Set up screens for each kitchen station. Each station shows items from its assigned categories.</p>
        </div>
        <Button size="sm" onClick={() => setEditingStation(null)}>
          <Plus className="w-4 h-4 mr-1.5" />Add Station
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : stations.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Monitor className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No stations yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a station for each kitchen screen</p>
          <Button className="mt-4" variant="outline" onClick={() => setEditingStation(null)}>
            <Plus className="w-4 h-4 mr-2" />Add Station
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map(station => {
            const assignedCats = categories.filter(c =>
              station.kds_station_categories.some(sc => sc.category_id === c.id)
            )
            return (
              <div
                key={station.id}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-indigo-300 transition-colors"
                onClick={() => setEditingStation(station)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${station.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{station.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {station.show_receipt && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">Full Receipt</span>
                      )}
                      {assignedCats.length === 0 ? (
                        <span className="text-[10px] text-amber-500">⚠ No categories assigned</span>
                      ) : assignedCats.map(c => (
                        <span key={c.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: c.color }}>
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">Edit →</span>
              </div>
            )
          })}
        </div>
      )}

      {editingStation !== undefined && (
        <StationEditor
          station={editingStation}
          categories={categories}
          shopId={shopId}
          onClose={() => setEditingStation(undefined)}
          onSaved={loadData}
          supabase={supabase}
        />
      )}
    </div>
  )
}

function StationEditor({
  station, categories, shopId, onClose, onSaved, supabase,
}: {
  station: KdsStation | null
  categories: Category[]
  shopId: string
  onClose: () => void
  onSaved: () => void
  supabase: any
}) {
  const isNew = !station
  const [name, setName] = useState(station?.name ?? '')
  const [isActive, setIsActive] = useState(station?.is_active ?? true)
  const [showReceipt, setShowReceipt] = useState(station?.show_receipt ?? false)
  const [assignedCatIds, setAssignedCatIds] = useState<Set<string>>(
    new Set(station?.kds_station_categories.map(sc => sc.category_id) ?? [])
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast.error('Station name is required'); return }
    setSaving(true)
    try {
      let stationId = station?.id
      if (isNew) {
        const { data, error } = await supabase
          .from('kds_stations')
          .insert({ shop_id: shopId, name: name.trim(), is_active: isActive, show_receipt: showReceipt })
          .select('id').single()
        if (error) throw error
        stationId = data.id
      } else {
        const { error } = await supabase
          .from('kds_stations')
          .update({ name: name.trim(), is_active: isActive, show_receipt: showReceipt })
          .eq('id', station!.id)
        if (error) throw error
      }

      // Sync categories
      await supabase.from('kds_station_categories').delete().eq('kds_station_id', stationId!)
      if (assignedCatIds.size > 0) {
        await supabase.from('kds_station_categories').insert(
          [...assignedCatIds].map(category_id => ({ kds_station_id: stationId!, category_id }))
        )
      }

      toast.success(isNew ? 'Station created' : 'Station saved')
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save station')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await supabase.from('kds_stations').delete().eq('id', station!.id)
      toast.success('Station deleted')
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex flex-col w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'New Station' : 'Edit Station'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Station Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Drinks Bar, Kitchen, Grill" />
          </div>

          {/* Settings */}
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Active</p>
                <p className="text-xs text-gray-400">Show this station on the KDS</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Show Full Receipt</p>
                <p className="text-xs text-gray-400">Display all items instead of filtering by category</p>
              </div>
              <Switch checked={showReceipt} onCheckedChange={setShowReceipt} />
            </div>
          </div>

          {/* Categories */}
          {!showReceipt && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Filter by Categories</p>
              <p className="text-xs text-gray-400 mb-3">Only items from these categories will appear on this station</p>
              {categories.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No categories found</p>
              ) : (
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <p className="text-sm text-gray-800">{cat.name}</p>
                      </div>
                      <Switch
                        checked={assignedCatIds.has(cat.id)}
                        onCheckedChange={v => {
                          setAssignedCatIds(prev => {
                            const n = new Set(prev)
                            v ? n.add(cat.id) : n.delete(cat.id)
                            return n
                          })
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {assignedCatIds.size === 0 && (
                <p className="text-xs text-amber-500 mt-2">⚠ No categories selected — no items will show unless you enable Full Receipt</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                <Button size="sm" variant="destructive" onClick={handleDelete}>Yes, delete</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
              </Button>
            )
          )}
          <div className={`flex items-center gap-2 ${isNew ? 'ml-auto' : ''}`}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Station' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
