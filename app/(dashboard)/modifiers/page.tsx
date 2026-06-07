'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const supabase = createClient()

interface ModifierGroup {
  id: string
  name: string
  required: boolean
  multiple_select: boolean
  created_at: string
  modifiers: Modifier[]
}

interface Modifier {
  id: string
  group_id: string
  name: string
  price: number
}

export default function ModifiersPage() {
  const [groups, setGroups]       = useState<ModifierGroup[]>([])
  const [loading, setLoading]     = useState(false)
  const [shopId, setShopId]       = useState<string | null>(null)

  // Group form state
  const [showForm, setShowForm]   = useState(false)
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const [required, setRequired]   = useState(false)
  const [multiSelect, setMultiSelect] = useState(false)
  const [options, setOptions]     = useState<{ name: string; price: string }[]>([{ name: '', price: '' }])

  // Expanded groups
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())

  // Load shop_id once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('app_users').select('shop_id').eq('auth_user_id', user.id).single()
        .then(({ data }) => { if (data) setShopId(data.shop_id) })
    })
  }, [])

  useEffect(() => { if (shopId) load() }, [shopId])

  async function load() {
    const { data: groupData } = await supabase
      .from('modifier_groups')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })

    const { data: modData } = await supabase
      .from('modifiers')
      .select('*')
      .in('group_id', (groupData || []).map(g => g.id))
      .order('created_at', { ascending: true })

    const modsByGroup: Record<string, Modifier[]> = {}
    for (const m of modData || []) {
      if (!modsByGroup[m.group_id]) modsByGroup[m.group_id] = []
      modsByGroup[m.group_id].push(m)
    }

    setGroups((groupData || []).map(g => ({ ...g, modifiers: modsByGroup[g.id] || [] })))
  }

  function openCreate() {
    setEditingGroup(null)
    setGroupName('')
    setRequired(false)
    setMultiSelect(false)
    setOptions([{ name: '', price: '' }])
    setShowForm(true)
  }

  function openEdit(group: ModifierGroup) {
    setEditingGroup(group)
    setGroupName(group.name)
    setRequired(group.required)
    setMultiSelect(group.multiple_select)
    setOptions(
      group.modifiers.length
        ? group.modifiers.map(m => ({ name: m.name, price: String(m.price) }))
        : [{ name: '', price: '' }]
    )
    setShowForm(true)
  }

  function addOption() { setOptions(prev => [...prev, { name: '', price: '' }]) }
  function removeOption(i: number) { setOptions(prev => prev.filter((_, idx) => idx !== i)) }
  function updateOption(i: number, field: string, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: val } : o))
  }

  async function handleSave() {
    if (!groupName.trim()) { toast.error('Group name is required'); return }
    if (!shopId) { toast.error('Shop not found'); return }
    const validOptions = options.filter(o => o.name.trim())
    if (validOptions.length === 0) { toast.error('Add at least one option'); return }

    setLoading(true)
    try {
      let groupId: string

      if (editingGroup) {
        // Update group
        const { error } = await supabase
          .from('modifier_groups')
          .update({ name: groupName, required, multiple_select: multiSelect })
          .eq('id', editingGroup.id)
        if (error) throw error
        groupId = editingGroup.id

        // Delete old modifiers and re-insert
        const { error: delErr } = await supabase
          .from('modifiers')
          .delete()
          .eq('group_id', groupId)
        if (delErr) throw delErr
      } else {
        // Insert new group
        const { data, error } = await supabase
          .from('modifier_groups')
          .insert({ shop_id: shopId, name: groupName, required, multiple_select: multiSelect })
          .select('id')
          .single()
        if (error) throw error
        groupId = data.id
      }

      // Insert modifiers
      const { error: modErr } = await supabase
        .from('modifiers')
        .insert(validOptions.map(o => ({
          group_id: groupId,
          name: o.name.trim(),
          price: parseFloat(o.price) || 0,
        })))
      if (modErr) throw modErr

      toast.success(editingGroup ? 'Modifier group updated' : 'Modifier group created')
      setShowForm(false)
      setEditingGroup(null)
      load()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteGroup(group: ModifierGroup) {
    if (!confirm(`Delete "${group.name}" and all its options?`)) return
    // Delete modifiers first
    await supabase.from('modifiers').delete().eq('group_id', group.id)
    await supabase.from('modifier_groups').delete().eq('id', group.id)
    toast.success('Deleted')
    load()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Modifiers</h1>
        <p className="text-sm text-gray-500 mt-1">Create modifier groups like size, toppings, extras</p>
      </div>

      <Button size="sm" onClick={openCreate}>
        <Plus className="w-4 h-4 mr-1.5" />Add Modifier Group
      </Button>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            {editingGroup ? 'Edit modifier group' : 'New modifier group'}
          </h2>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Group name</label>
            <Input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. Size, Toppings, Add-ons"
            />
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={required}
                onChange={e => setRequired(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={multiSelect}
                onChange={e => setMultiSelect(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Multiple select</span>
            </label>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Options</p>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={opt.name}
                  onChange={e => updateOption(i, 'name', e.target.value)}
                  placeholder="Option name"
                  className="flex-1"
                />
                <Input
                  value={opt.price}
                  onChange={e => updateOption(i, 'price', e.target.value)}
                  placeholder="₱0"
                  type="number"
                  className="w-24"
                />
                {options.length > 1 && (
                  <button onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addOption}>
              <Plus className="w-3 h-3 mr-1" />Add option
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving…' : editingGroup ? 'Update' : 'Create'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingGroup(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            No modifier groups yet
          </div>
        ) : groups.map(group => (
          <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => toggleExpand(group.id)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                {expanded.has(group.id)
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-400" />
                }
                <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                <span className="text-xs text-gray-400">{group.modifiers.length} option{group.modifiers.length !== 1 ? 's' : ''}</span>
                {group.required && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">Required</span>
                )}
                {group.multiple_select && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">Multi-select</span>
                )}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(group)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Options list */}
            {expanded.has(group.id) && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {group.modifiers.map(mod => (
                  <div key={mod.id} className="flex items-center justify-between px-8 py-2.5">
                    <span className="text-sm text-gray-700">{mod.name}</span>
                    <span className="text-sm text-gray-500">
                      {mod.price > 0 ? `+₱${mod.price.toFixed(2)}` : 'Free'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
