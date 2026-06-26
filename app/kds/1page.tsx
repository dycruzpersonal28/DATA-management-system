'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Monitor, Clock, CheckCircle2, ChefHat, Bell, RefreshCw, ArrowLeft, X } from 'lucide-react'

// ── Sound Settings Types ───────────────────────────────────────────────────────
type SoundSettings = {
  enabled: boolean
  newOrder: boolean
  criticalMinutes: number       // alert after N minutes
  criticalRepeatSeconds: number // repeat every N seconds
  readyRepeatSeconds: number    // remind every N seconds for ready-not-served
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  newOrder: true,
  criticalMinutes: 10,
  criticalRepeatSeconds: 30,
  readyRepeatSeconds: 60,
}

// ── Web Audio Sound Engine ─────────────────────────────────────────────────────
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null)

  function getCtx() {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }

  function playNewOrder() {
    const ctx = getCtx()
    const now = ctx.currentTime
    const freqs = [880, 1760, 2640]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      const vol = i === 0 ? 0.6 : 0.2 / (i + 1)
      gain.gain.setValueAtTime(vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8)
      osc.start(now)
      osc.stop(now + 1.8)
    })
    setTimeout(() => {
      const ctx2 = getCtx()
      const t = ctx2.currentTime
      const freqs2 = [880, 1760]
      freqs2.forEach((freq, i) => {
        const osc = ctx2.createOscillator()
        const gain = ctx2.createGain()
        osc.connect(gain)
        gain.connect(ctx2.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        const vol = i === 0 ? 0.5 : 0.15
        gain.gain.setValueAtTime(vol, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4)
        osc.start(t)
        osc.stop(t + 1.4)
      })
    }, 350)
  }

  function playCritical() {
    const ctx = getCtx()
    const now = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(480, now + i * 0.22)
      gain.gain.setValueAtTime(0, now + i * 0.22)
      gain.gain.linearRampToValueAtTime(0.35, now + i * 0.22 + 0.02)
      gain.gain.setValueAtTime(0.35, now + i * 0.22 + 0.12)
      gain.gain.linearRampToValueAtTime(0, now + i * 0.22 + 0.18)
      osc.start(now + i * 0.22)
      osc.stop(now + i * 0.22 + 0.2)
    }
  }

  function playReadyReminder() {
    const ctx = getCtx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, now)
    osc.frequency.setValueAtTime(880, now + 0.15)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    osc.start(now)
    osc.stop(now + 0.6)
  }

  return { playNewOrder, playCritical, playReadyReminder }
}

// ── Sound Settings Panel ───────────────────────────────────────────────────────
function SoundSettingsPanel({
  settings,
  onChange,
  onClose,
  onTest,
}: {
  settings: SoundSettings
  onChange: (s: SoundSettings) => void
  onClose: () => void
  onTest: (type: 'newOrder' | 'critical' | 'ready') => void
}) {
  function set(patch: Partial<SoundSettings>) {
    onChange({ ...settings, ...patch })
  }

  return (
    <div className="absolute top-14 right-4 z-50 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5 text-sm text-white">
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-base">Sound Alerts</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
        <span className="text-gray-300 font-medium">Enable Sounds</span>
        <button
          onClick={() => set({ enabled: !settings.enabled })}
          className={`w-11 h-6 rounded-full transition-colors relative ${settings.enabled ? 'bg-amber-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.enabled ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
        </button>
      </div>

      <div className={`space-y-5 ${!settings.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-300">🔔 New Order Bell</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onTest('newOrder')} className="text-xs text-amber-400 hover:text-amber-300 underline">test</button>
              <button
                onClick={() => set({ newOrder: !settings.newOrder })}
                className={`w-9 h-5 rounded-full transition-colors relative ${settings.newOrder ? 'bg-amber-500' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.newOrder ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600">Double bell when a new order appears</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">🚨 Critical Age Alert</span>
            <button onClick={() => onTest('critical')} className="text-xs text-amber-400 hover:text-amber-300 underline">test</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-gray-500 w-32 shrink-0">Trigger after</label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="range" min={3} max={30} step={1}
                  value={settings.criticalMinutes}
                  onChange={e => set({ criticalMinutes: +e.target.value })}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-amber-400 font-mono w-12 text-right">{settings.criticalMinutes}m</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-gray-500 w-32 shrink-0">Repeat every</label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="range" min={10} max={120} step={5}
                  value={settings.criticalRepeatSeconds}
                  onChange={e => set({ criticalRepeatSeconds: +e.target.value })}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-amber-400 font-mono w-12 text-right">{settings.criticalRepeatSeconds}s</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">⏰ Ready Reminder</span>
            <button onClick={() => onTest('ready')} className="text-xs text-amber-400 hover:text-amber-300 underline">test</button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs text-gray-500 w-32 shrink-0">Remind every</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="range" min={15} max={180} step={5}
                value={settings.readyRepeatSeconds}
                onChange={e => set({ readyRepeatSeconds: +e.target.value })}
                className="flex-1 accent-amber-500"
              />
              <span className="text-amber-400 font-mono w-12 text-right">{settings.readyRepeatSeconds}s</span>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-1">Plays when orders sit at Ready without being served</p>
        </div>
      </div>
    </div>
  )
}

// ── KDS Types ──────────────────────────────────────────────────────────────────
type KdsStation = {
  id: string
  name: string
  is_active: boolean
  show_receipt: boolean
  kds_station_categories: { category_id: string }[]
}

type ReceiptItem = {
  id: string
  item_id: string
  item_name: string
  variant_name: string | null
  quantity: number
  note: string | null
  modifiers: any[]
  addons: any[]
  category_id?: string
}

type KdsOrder = {
  id: string
  receipt_id: string
  status: 'pending' | 'preparing' | 'ready' | 'served'
  created_at: string
  updated_at: string
  receipt: {
    id: string
    receipt_number: string
    created_at: string
    dining_option?: { name: string }
    note?: string
  }
  items: ReceiptItem[]
}

const STATUS_CONFIG = {
  pending:   { label: 'New',       color: 'bg-red-500',     next: 'preparing', nextLabel: 'Start Preparing' },
  preparing: { label: 'Preparing', color: 'bg-amber-500',   next: 'ready',     nextLabel: 'Mark Ready' },
  ready:     { label: 'Ready',     color: 'bg-emerald-500', next: 'served',    nextLabel: 'Mark Served' },
  served:    { label: 'Served',    color: 'bg-gray-400',    next: null,        nextLabel: null },
}

// ── Station Picker ─────────────────────────────────────────────────────────────
function StationPicker({ stations, onSelect }: {
  stations: KdsStation[]
  onSelect: (station: KdsStation) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-2">
          <ChefHat className="w-8 h-8 text-amber-400" />
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
        </div>
        <p className="text-center text-gray-500 text-sm mb-10">Select a station to open</p>
        <div className="space-y-3">
          {stations.map(station => (
            <button
              key={station.id}
              onClick={() => onSelect(station)}
              className="w-full flex items-center justify-between px-5 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-amber-500/50 rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white text-sm">{station.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {station.show_receipt
                      ? 'Full receipt view'
                      : `${station.kds_station_categories.length} categor${station.kds_station_categories.length === 1 ? 'y' : 'ies'}`}
                  </p>
                </div>
              </div>
              <span className="text-gray-600 group-hover:text-amber-400 text-lg transition-colors">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Elapsed Hook ───────────────────────────────────────────────────────────────
function useElapsed(dateStr: string, frozen = false) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(dateStr).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    if (frozen) return // don't start interval if frozen
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [dateStr, frozen])
  return elapsed
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function elapsedColor(seconds: number, criticalSeconds: number) {
  if (seconds < criticalSeconds * 0.5) return 'text-emerald-400'
  if (seconds < criticalSeconds) return 'text-amber-400'
  return 'text-red-400'
}

// ── Order Card ─────────────────────────────────────────────────────────────────
function OrderCard({ order, onAdvance, criticalSeconds }: {
  order: KdsOrder
  onAdvance: (orderId: string, to: string, from: string) => void
  criticalSeconds: number
}) {
  const elapsed = useElapsed(order.created_at, order.status === 'served')
  const cfg = STATUS_CONFIG[order.status]
  const isServed = order.status === 'served'
  const isCritical = elapsed >= criticalSeconds && order.status !== 'served'

  return (
    <div className={`flex flex-col rounded-2xl border-2 shadow-sm transition-all overflow-hidden ${
      isCritical                          ? 'border-red-500 bg-gray-900 shadow-red-900/40 shadow-lg' :
      order.status === 'pending'          ? 'border-red-800 bg-gray-900' :
      order.status === 'preparing'        ? 'border-amber-700 bg-gray-900' :
      order.status === 'ready'            ? 'border-emerald-500 bg-gray-900 shadow-emerald-900/30 shadow-lg' :
      'border-gray-800 bg-gray-900 opacity-60'
    }`}>
      {/* Card header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isCritical                          ? 'bg-red-950/60' :
        order.status === 'pending'          ? 'bg-red-950/30' :
        order.status === 'preparing'        ? 'bg-amber-950/30' :
        order.status === 'ready'            ? 'bg-emerald-950/30' :
        'bg-gray-800/40'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">#{order.receipt.receipt_number}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${cfg.color}`}>
              {cfg.label}
            </span>
            {isCritical && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                LATE
              </span>
            )}
          </div>
          {order.receipt.dining_option?.name && (
            <span className="text-xs text-indigo-400 font-medium">{order.receipt.dining_option.name}</span>
          )}
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold tabular-nums ${elapsedColor(elapsed, criticalSeconds)}`}>
            <Clock className="w-3 h-3 inline mr-0.5 -mt-0.5" />
            {formatElapsed(elapsed)}
          </div>
          <p className="text-[10px] text-gray-500">
            {new Date(order.receipt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {order.items.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="border-b border-gray-800 pb-2 last:border-0 last:pb-0">
            <p className="text-sm font-semibold text-white">
              <span className="text-base font-bold text-indigo-400 mr-1.5">{item.quantity}×</span>
              {item.item_name}
              {item.variant_name && <span className="text-gray-500 font-normal ml-1">({item.variant_name})</span>}
            </p>
            {item.modifiers?.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {item.modifiers.map((m: any, i: number) => (
                  <p key={i} className="text-xs text-gray-400">• {m.name}</p>
                ))}
              </div>
            )}
            {item.addons?.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {item.addons.map((a: any, i: number) => (
                  <p key={i} className="text-xs text-indigo-400">+ {a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''}</p>
                ))}
              </div>
            )}
            {item.note && (
              <p className="text-xs text-amber-400 font-medium mt-0.5 bg-amber-950/40 px-2 py-0.5 rounded-lg">
                📝 {item.note}
              </p>
            )}
          </div>
        ))}
        {order.receipt.note && (
          <div className="mt-2 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-300 font-medium">Order note: {order.receipt.note}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      {!isServed && cfg.next && (
        <div className="px-4 pb-4 pt-2">
          <button
            onClick={() => onAdvance(order.id, cfg.next!, order.status)}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 ${
              order.status === 'pending'   ? 'bg-red-500 hover:bg-red-600' :
              order.status === 'preparing' ? 'bg-amber-500 hover:bg-amber-600' :
              'bg-emerald-500 hover:bg-emerald-600'
            }`}
          >
            {order.status === 'ready' && <Bell className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
            {cfg.nextLabel}
          </button>
        </div>
      )}
      {isServed && (
        <div className="px-4 pb-4 pt-2 flex items-center justify-center gap-1.5 text-gray-600 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Served
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function KdsDisplayPage() {
  const supabase = createClient()
  const [stations, setStations] = useState<KdsStation[]>([])
  const [selectedStation, setSelectedStation] = useState<KdsStation | null>(null)
  const [orders, setOrders] = useState<KdsOrder[]>([])
  const [shopId, setShopId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showServed, setShowServed] = useState(false)
  const [showSoundSettings, setShowSoundSettings] = useState(false)
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS)

  const channelRef = useRef<any>(null)
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const criticalAlertedRef = useRef<Map<string, number>>(new Map())
  const readyAlertedRef = useRef<Map<string, number>>(new Map())
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Suppress DB-triggered reloads for 3s after an optimistic update so the
  // realtime echo of our own write can't overwrite local state before the DB
  // read catches up.
  const suppressReloadUntilRef = useRef<number>(0)

  // FIX: Keep soundSettings in a ref so loadOrders can read the latest value
  // without having soundSettings in its dependency array (which caused
  // loadOrders to be recreated on every slider change, triggering a full
  // re-fetch that would race against in-flight served updates).
  const soundSettingsRef = useRef(soundSettings)
  useEffect(() => { soundSettingsRef.current = soundSettings }, [soundSettings])

  const audio = useAudio()

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase.from('shops').select('id').single()
      if (!shop) { setLoading(false); return }
      setShopId(shop.id)

      const { data: stns } = await supabase
        .from('kds_stations')
        .select('*, kds_station_categories(category_id)')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('sort_order')

      setStations(stns ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // FIX: Removed `soundSettings` and `showServed` from deps.
  // - showServed is only used in render (line ~747), not inside this function.
  // - soundSettings is now read via soundSettingsRef.current so it's always
  //   fresh but doesn't cause loadOrders to be recreated on every change.
  // Result: loadOrders is only recreated when station/shop changes, so the
  // auto-refresh interval stays stable and won't race against DB updates.
  const loadOrders = useCallback(async (force = false) => {
    if (!selectedStation || !shopId) return
    // Skip reload if we just did an optimistic update — wait for suppression to lift
    if (!force && Date.now() < suppressReloadUntilRef.current) return

    const ss = soundSettingsRef.current
    const catIds = selectedStation.kds_station_categories.map(sc => sc.category_id)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, receipt_number, created_at, note, dining_options(name)')
      .eq('shop_id', shopId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    if (!receipts || receipts.length === 0) { setOrders([]); return }

    const receiptIds = receipts.map(r => r.id)

    const { data: allItems } = await supabase
      .from('receipt_items')
      .select('id, receipt_id, item_id, item_name, variant_name, quantity, note, modifiers, addons')
      .in('receipt_id', receiptIds)

    const itemIds = [...new Set((allItems ?? []).map(i => i.item_id).filter(Boolean))]
    const { data: itemCats } = itemIds.length > 0
      ? await supabase.from('items').select('id, category_id').in('id', itemIds)
      : { data: [] }

    const itemCatMap = new Map((itemCats ?? []).map(i => [i.id, i.category_id]))

    const { data: kdsOrders } = await supabase
      .from('kds_orders')
      .select('id, receipt_id, status, created_at, updated_at')
      .in('receipt_id', receiptIds)
      .eq('shop_id', shopId)

    const kdsMap = new Map((kdsOrders ?? []).map(k => [k.receipt_id, k]))

    const built: KdsOrder[] = []
    for (const receipt of receipts) {
      let items = (allItems ?? []).filter(i => i.receipt_id === receipt.id)

      if (!selectedStation.show_receipt && catIds.length > 0) {
        items = items.filter(i => {
          const catId = itemCatMap.get(i.item_id)
          return catId && catIds.includes(catId)
        })
        if (items.length === 0) continue
      }

      const kds = kdsMap.get(receipt.id)
      built.push({
        id: kds?.id ?? receipt.id,
        receipt_id: receipt.id,
        status: (kds?.status as any) ?? 'pending',
        created_at: receipt.created_at,
        updated_at: kds?.updated_at ?? receipt.created_at,
        receipt: {
          id: receipt.id,
          receipt_number: receipt.receipt_number,
          created_at: receipt.created_at,
          dining_option: (receipt as any).dining_options ?? undefined,
          note: receipt.note ?? undefined,
        },
        items: items.map(i => ({
          ...i,
          modifiers: Array.isArray(i.modifiers) ? i.modifiers : [],
          addons: Array.isArray(i.addons) ? i.addons : [],
        })),
      })
    }

    const statusOrder = { pending: 0, preparing: 1, ready: 2, served: 3 }
    built.sort((a, b) => {
      const sd = statusOrder[a.status] - statusOrder[b.status]
      if (sd !== 0) return sd
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    // Sound: detect new orders
    if (ss.enabled && ss.newOrder) {
      const newIds = built.map(o => o.receipt_id)
      const prevIds = prevOrderIdsRef.current
      const hasNew = newIds.some(id => !prevIds.has(id))
      if (hasNew && prevIds.size > 0) {
        audio.playNewOrder()
      }
      prevOrderIdsRef.current = new Set(newIds)
    } else {
      prevOrderIdsRef.current = new Set(built.map(o => o.receipt_id))
    }

    // FIX: Merge incoming DB data with current optimistic state.
    // If an order was marked served locally but the DB hasn't confirmed yet,
    // keep the local 'served' status so the card doesn't flicker back.
    setOrders(prev => {
      const localStatusMap = new Map(prev.map(o => [o.receipt_id, o.status]))
      return built.map(o => {
        const localStatus = localStatusMap.get(o.receipt_id)
        // If local state is ahead of DB (e.g. served vs ready), trust local
        const statusOrder = { pending: 0, preparing: 1, ready: 2, served: 3 }
        if (
          localStatus &&
          statusOrder[localStatus] > statusOrder[o.status as keyof typeof statusOrder]
        ) {
          return { ...o, status: localStatus }
        }
        return o
      })
    })
  }, [selectedStation, shopId]) // FIX: only recreate when station/shop changes

  // Auto refresh every 10 seconds
  useEffect(() => {
    if (!selectedStation) return
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    autoRefreshRef.current = setInterval(() => { loadOrders() }, 10_000)
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [selectedStation, loadOrders])

  useEffect(() => { loadOrders() }, [loadOrders])

  // Sound: periodic critical + ready alerts
  useEffect(() => {
    if (!soundSettings.enabled) return

    const id = setInterval(() => {
      const now = Date.now()
      const criticalMs = soundSettings.criticalMinutes * 60 * 1000
      const criticalRepeatMs = soundSettings.criticalRepeatSeconds * 1000
      const readyRepeatMs = soundSettings.readyRepeatSeconds * 1000

      let playCriticalSound = false
      let playReadySound = false

      orders.forEach(order => {
        if (order.status === 'served') return
        const age = now - new Date(order.created_at).getTime()

        if (age >= criticalMs) {
          const lastAlerted = criticalAlertedRef.current.get(order.receipt_id) ?? 0
          if (now - lastAlerted >= criticalRepeatMs) {
            criticalAlertedRef.current.set(order.receipt_id, now)
            playCriticalSound = true
          }
        }

        if (order.status === 'ready') {
          const lastAlerted = readyAlertedRef.current.get(order.receipt_id) ?? 0
          if (now - lastAlerted >= readyRepeatMs) {
            readyAlertedRef.current.set(order.receipt_id, now)
            playReadySound = true
          }
        }
      })

      if (playCriticalSound) audio.playCritical()
      if (playReadySound) {
        setTimeout(() => audio.playReadyReminder(), playCriticalSound ? 1200 : 0)
      }
    }, 5_000)

    return () => clearInterval(id)
  }, [orders, soundSettings])

  // Realtime subscription
  useEffect(() => {
    if (!shopId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel('kds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: `shop_id=eq.${shopId}` }, () => {
        // Small delay so new receipts are fully committed before we fetch
        setTimeout(() => loadOrders(), 500)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders', filter: `shop_id=eq.${shopId}` }, () => {
        // Delay + suppression check: ignore the echo of our own writes for 3s
        setTimeout(() => loadOrders(), 500)
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [shopId, loadOrders])

  async function advanceOrder(orderId: string, toStatus: string, fromStatus: string) {
    const order = orders.find(o => o.id === orderId || o.receipt_id === orderId)
    if (!order) return

    const now = new Date().toISOString()
    const durationSeconds = order.updated_at
      ? Math.floor((Date.now() - new Date(order.updated_at).getTime()) / 1000)
      : null

    // FIX: Optimistically update UI immediately (moved to top, before DB calls)
    // so any concurrent auto-refresh sees the new status in local state first
    // and won't overwrite it via the merge logic in loadOrders.
    setOrders(prev => prev.map(o =>
      (o.id === orderId || o.receipt_id === order.receipt_id)
        ? { ...o, status: toStatus as any, updated_at: now }
        : o
    ))

    // Suppress any DB-triggered reloads for 3 seconds so the realtime echo
    // of our own write can't race and overwrite the optimistic state above.
    suppressReloadUntilRef.current = Date.now() + 3000

    // Clear alerts for this order when it advances
    criticalAlertedRef.current.delete(order.receipt_id)
    readyAlertedRef.current.delete(order.receipt_id)

    let kdsOrderId = order.id

    const { data: existing } = await supabase
      .from('kds_orders')
      .select('id')
      .eq('receipt_id', order.receipt_id)
      .eq('shop_id', shopId)
      .maybeSingle()

    if (existing) {
      const { data: updateData, error: updateError } = await supabase
        .from('kds_orders')
        .update({ status: toStatus, updated_at: now })
        .eq('id', existing.id)
        .select('id, status')
        .single()

      if (updateError) {
        console.error('[KDS] Update failed:', updateError)
        // Revert optimistic update on failure
        setOrders(prev => prev.map(o =>
          (o.id === orderId || o.receipt_id === order.receipt_id)
            ? { ...o, status: fromStatus as any }
            : o
        ))
        return
      }
      console.log('[KDS] Update confirmed in DB:', updateData)
      kdsOrderId = existing.id
    } else {
      const { data: created, error: insertError } = await supabase
        .from('kds_orders')
        .insert({ shop_id: shopId, receipt_id: order.receipt_id, status: toStatus, items: order.items, updated_at: now })
        .select('id').single()

      if (insertError) {
        console.error('[KDS] Insert failed:', insertError)
        setOrders(prev => prev.map(o =>
          (o.id === orderId || o.receipt_id === order.receipt_id)
            ? { ...o, status: fromStatus as any }
            : o
        ))
        return
      }
      kdsOrderId = created?.id ?? orderId
    }

    await supabase.from('kds_order_logs').insert({
      kds_order_id: kdsOrderId,
      receipt_id: order.receipt_id,
      kds_station_id: selectedStation?.id ?? null,
      from_status: fromStatus,
      to_status: toStatus,
      changed_at: now,
      duration_seconds: durationSeconds,
    })

    // Update with confirmed DB id once we have it
    setOrders(prev => prev.map(o =>
      (o.id === orderId || o.receipt_id === order.receipt_id)
        ? { ...o, id: kdsOrderId, status: toStatus as any, updated_at: now }
        : o
    ))
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center space-y-3">
          <ChefHat className="w-10 h-10 mx-auto text-gray-500 animate-pulse" />
          <p className="text-gray-400">Loading Kitchen Display…</p>
        </div>
      </div>
    )
  }

  if (stations.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center space-y-3">
          <Monitor className="w-10 h-10 mx-auto text-gray-500" />
          <p className="text-lg font-semibold">No KDS Stations Configured</p>
          <p className="text-gray-400 text-sm">Go to Settings → Kitchen Display to set up stations</p>
        </div>
      </div>
    )
  }

  if (!selectedStation) {
    return <StationPicker stations={stations} onSelect={setSelectedStation} />
  }

  const visibleOrders = showServed ? orders : orders.filter(o => o.status !== 'served')
  const pendingCount = orders.filter(o => o.status === 'pending').length
  const preparingCount = orders.filter(o => o.status === 'preparing').length
  const readyCount = orders.filter(o => o.status === 'ready').length
  const criticalSeconds = soundSettings.criticalMinutes * 60

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedStation(null)}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
            title="Change station"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ChefHat className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-white text-sm">{selectedStation.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">{pendingCount} new</span>
            )}
            {preparingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">{preparingCount} preparing</span>
            )}
            {readyCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">{readyCount} ready</span>
            )}
          </div>
          <button
            onClick={() => setShowServed(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${showServed ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {showServed ? 'Hide Served' : 'Show Served'}
          </button>
          <button onClick={() => loadOrders(true)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSoundSettings(v => !v)}
            className={`p-1.5 rounded-lg transition-colors relative ${showSoundSettings ? 'bg-gray-700 text-amber-400' : 'hover:bg-gray-800 text-gray-400 hover:text-white'}`}
            title="Sound settings"
          >
            <Bell className="w-4 h-4" />
            {!soundSettings.enabled && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Sound settings panel */}
      {showSoundSettings && (
        <div className="relative">
          <SoundSettingsPanel
            settings={soundSettings}
            onChange={setSoundSettings}
            onClose={() => setShowSoundSettings(false)}
            onTest={(type) => {
              if (type === 'newOrder') audio.playNewOrder()
              else if (type === 'critical') audio.playCritical()
              else audio.playReadyReminder()
            }}
          />
        </div>
      )}

      {/* Orders grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
            <CheckCircle2 className="w-12 h-12" />
            <p className="text-lg font-semibold">All caught up!</p>
            <p className="text-sm">No active orders for {selectedStation.name}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min">
            {visibleOrders.map(order => (
              <OrderCard
                key={`${order.receipt_id}-${order.status}`}
                order={order}
                onAdvance={advanceOrder}
                criticalSeconds={criticalSeconds}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-600">
          {selectedStation.show_receipt ? 'Full Receipt' : `${selectedStation.kds_station_categories.length} categories`}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-700">auto-refresh 10s</span>
          <LiveClock />
        </div>
      </div>
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-xs text-gray-500 tabular-nums">
      {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}
