'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Employee {
  id: string
  name: string
  role: string
  employee_no: string | null
  require_manager_approval: boolean
}

interface ShiftSchedule {
  id: string
  name: string
  start_time: string
  end_time: string
}

type KioskStep = 'select' | 'pin_first' | 'pin_first_confirm' | 'employee_pin' | 'manager_pin' | 'photo' | 'success' | 'error'

// ─── Teal avatar shades — cycles for visual variety ──────────────────────────
const TEAL_SHADES = [
  { bg: '#1D9E75', ring: '#9FE1CB' },
  { bg: '#0F6E56', ring: '#5DCAA5' },
  { bg: '#14826A', ring: '#9FE1CB' },
  { bg: '#0D6B58', ring: '#5DCAA5' },
  { bg: '#1A9470', ring: '#9FE1CB' },
]

function avatarShade(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return TEAL_SHADES[Math.abs(hash) % TEAL_SHADES.length]
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0]
}

// ─── Dynamic sizing based on employee count ───────────────────────────────────
function getGridConfig(count: number): {
  cols: string
  cardPadding: string
  avatarSize: string
  avatarText: string
  nameText: string
  roleText: string
  badgeText: string
} {
  if (count <= 4) return {
    cols: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-4',
    cardPadding: 'p-5 sm:p-6 md:p-8',
    avatarSize: 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24',
    avatarText: 'text-2xl sm:text-2xl md:text-3xl',
    nameText: 'text-sm md:text-base',
    roleText: 'text-xs sm:text-sm',
    badgeText: 'text-xs sm:text-sm px-3 sm:px-4 py-1 sm:py-1.5',
  }
  if (count <= 8) return {
    cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    cardPadding: 'p-4 sm:p-5 md:p-6',
    avatarSize: 'w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20',
    avatarText: 'text-xl sm:text-xl md:text-2xl',
    nameText: 'text-xs sm:text-sm',
    roleText: 'text-xs',
    badgeText: 'text-xs px-2 sm:px-3 py-0.5 sm:py-1',
  }
  if (count <= 12) return {
    cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-4',
    cardPadding: 'p-3 sm:p-4 md:p-5',
    avatarSize: 'w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16',
    avatarText: 'text-lg sm:text-xl',
    nameText: 'text-xs sm:text-sm',
    roleText: 'text-xs',
    badgeText: 'text-xs px-2 sm:px-3 py-0.5 sm:py-1',
  }
  if (count <= 20) return {
    cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
    cardPadding: 'p-3 sm:p-4',
    avatarSize: 'w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14',
    avatarText: 'text-base sm:text-lg',
    nameText: 'text-xs',
    roleText: 'text-xs',
    badgeText: 'text-xs px-2 py-0.5',
  }
  return {
    cols: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6',
    cardPadding: 'p-2.5 sm:p-3',
    avatarSize: 'w-10 h-10 sm:w-12 sm:h-12',
    avatarText: 'text-sm sm:text-base',
    nameText: 'text-xs',
    roleText: 'hidden',
    badgeText: 'text-xs px-2 py-0.5',
  }
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────
function PinPad({
  value,
  onChange,
  maxLen = 6,
}: {
  value: string
  onChange: (v: string) => void
  maxLen?: number
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  const press = (k: string) => {
    if (k === '⌫') { onChange(value.slice(0, -1)); return }
    if (k === '') return
    if (value.length < maxLen) onChange(value + k)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {Array.from({ length: maxLen }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
              i < value.length ? 'scale-110' : 'bg-transparent border-gray-300'
            }`}
            style={i < value.length ? { background: '#1D9E75', borderColor: '#1D9E75' } : {}}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => (
          <button
            key={i}
            onClick={() => press(k)}
            disabled={k === ''}
            className={`
              w-14 h-12 rounded-xl text-base font-semibold transition-all duration-100 select-none
              ${k === ''
                ? 'invisible'
                : k === '⌫'
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95'
                : 'bg-white border border-gray-200 text-gray-900 hover:bg-teal-50 hover:border-teal-300 active:scale-95 shadow-sm'
              }
            `}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Kiosk ───────────────────────────────────────────────────────────────
export default function KioskPage() {
  const router = useRouter()
  const [step, setStep]                   = useState<KioskStep>('select')
  const [employees, setEmployees]         = useState<Employee[]>([])
  const [shifts, setShifts]               = useState<ShiftSchedule[]>([])
  const [shopId, setShopId]               = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)

  const [selected, setSelected]           = useState<Employee | null>(null)
  const [selectedShift, setSelectedShift] = useState<string>('')
  const [employeePin, setEmployeePin]     = useState('')
  const [managerPin, setManagerPin]       = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [pendingAction, setPendingAction] = useState<string>('clock_in')
  const [resultMsg, setResultMsg]         = useState('')
  const [errorMsg, setErrorMsg]           = useState('')
  const [clockedInIds, setClockedInIds]   = useState<Set<string>>(new Set())
  const [onBreakIds, setOnBreakIds]       = useState<Set<string>>(new Set())
  const [breakMode, setBreakMode]         = useState<'auto' | 'manual'>('auto')
  const [kioskMode, setKioskMode]         = useState<'show_all' | 'pin_first'>('show_all')
  const [search, setSearch]               = useState('')
  const [time, setTime]                   = useState<Date | null>(null)

  // PIN-first mode state
  const [pinFirstPin, setPinFirstPin]     = useState('')
  const [pinFirstError, setPinFirstError] = useState('')
  const [pinFirstLoading, setPinFirstLoading] = useState(false)

  // Camera / photo state
  const videoRef        = useRef<HTMLVideoElement | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const [capturedPhoto, setCapturedPhoto]         = useState<string | null>(null)
  const [cameraReady, setCameraReady]             = useState(false)
  const [cameraError, setCameraError]             = useState(false)
  const [pendingSubmitAction, setPendingSubmitAction] = useState<string>('')

  useEffect(() => {
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (step === 'success' || step === 'error') {
      const t = setTimeout(() => resetKiosk(), 5000)
      return () => clearTimeout(t)
    }
  }, [step])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, shiftRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/shifts'),
      ])
      const empData   = await empRes.json()
      const shiftData = await shiftRes.json()

      const emps: Employee[] = (empData.employees ?? []).filter((e: any) => e.is_kiosk_visible)
      setEmployees(emps)
      setShifts(shiftData.shifts?.filter((s: ShiftSchedule & { is_active: boolean }) => s.is_active) ?? [])

      if (empData.shop_id) setShopId(empData.shop_id)
      else if (empData.employees?.[0]) {
        const pingRes  = await fetch('/api/ping')
        const pingData = await pingRes.json()
        setShopId(pingData.shop_id ?? null)
      }

      const [logRes, settingsRes] = await Promise.all([
        fetch('/api/time-logs?active_only=true'),
        fetch('/api/payroll/settings'),
      ])
      const logData      = await logRes.json()
      const settingsData = await settingsRes.json()

      const active  = new Set<string>()
      const onBreak = new Set<string>()
      for (const l of logData.logs ?? []) {
        if (l.log_type === 'break') onBreak.add(l.employee_id as string)
        else active.add(l.employee_id as string)
      }
      setClockedInIds(active)
      setOnBreakIds(onBreak)
      if (settingsData?.settings?.break_mode) {
        setBreakMode(settingsData.settings.break_mode)
      }
      if (settingsData?.settings?.kiosk_mode) {
        setKioskMode(settingsData.settings.kiosk_mode)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  const resetKiosk = () => {
    stopCamera()
    setStep(kioskMode === 'pin_first' ? 'pin_first' : 'select')
    setSelected(null)
    setSelectedShift('')
    setEmployeePin('')
    setManagerPin('')
    setResultMsg('')
    setErrorMsg('')
    setSearch('')
    setPendingAction('clock_in')
    setPinFirstPin('')
    setPinFirstError('')
    setCapturedPhoto(null)
    setCameraReady(false)
    setCameraError(false)
    setPendingSubmitAction('')
  }

  // After data loads, set initial step based on kiosk mode
  useEffect(() => {
    if (!loading) {
      setStep(kioskMode === 'pin_first' ? 'pin_first' : 'select')
    }
  }, [loading, kioskMode])

  const startCamera = useCallback(async () => {
    setCameraReady(false)
    setCameraError(false)
    setCapturedPhoto(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setCameraReady(true)
        }
      }
    } catch (err) {
      console.warn('Camera unavailable:', err)
      setCameraError(true)
    }
  }, [])

  const takeSnapshot = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85))
    stopCamera()
  }, [stopCamera])

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null)
    startCamera()
  }, [startCamera])

  const uploadPhotoToDrive = useCallback((photo: string, name: string, action: string) => {
    fetch('/api/kiosk-photo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64: photo, employeeName: name, action }),
    })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) {
          console.error('Drive upload failed:', data.error)
        } else {
          console.log('Drive upload success:', data.name)
        }
      })
      .catch(err => console.error('Drive upload error:', err))
  }, [])

  const goToPhoto = useCallback((action: string) => {
    setPendingSubmitAction(action)
    setStep('photo')
    startCamera()
  }, [startCamera])

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/login')
  }

  // ─── PIN-first: look up employee by PIN ──────────────────────────────────────
  const handlePinFirstSubmit = async () => {
    if (pinFirstPin.length < 4) return
    setPinFirstLoading(true)
    setPinFirstError('')
    try {
      const res = await fetch('/api/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:   'identify_by_pin',
          pin:      pinFirstPin,
          shop_id:  shopId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.employee) {
        setPinFirstError('PIN not recognised. Please try again.')
        setPinFirstPin('')
        return
      }
      const emp: Employee = data.employee
      setSelected(emp)

      // Determine action
      const isClockedIn = clockedInIds.has(emp.id)
      const isOnBreak   = onBreakIds.has(emp.id)
      if (!isClockedIn && !isOnBreak) setPendingAction('clock_in')
      else if (isOnBreak) setPendingAction('back_to_work')
      else setPendingAction(breakMode === 'manual' ? 'break_out' : 'clock_out')

      setStep('pin_first_confirm')
    } catch {
      setPinFirstError('Something went wrong. Please try again.')
      setPinFirstPin('')
    } finally {
      setPinFirstLoading(false)
    }
  }

  // Auto-submit when PIN reaches 4+ digits in pin_first mode
  useEffect(() => {
    if (step === 'pin_first' && pinFirstPin.length >= 6) {
      handlePinFirstSubmit()
    }
  }, [pinFirstPin])

  const selectEmployee = (emp: Employee) => {
    const isClockedIn = clockedInIds.has(emp.id)
    const isOnBreak   = onBreakIds.has(emp.id)
    if (!isClockedIn && !isOnBreak && !selectedShift) return
    setSelected(emp)
    if (!isClockedIn && !isOnBreak) setPendingAction('clock_in')
    else if (isOnBreak) setPendingAction('back_to_work')
    else setPendingAction(breakMode === 'manual' ? 'break_out' : 'clock_out')
    setStep('employee_pin')
  }

  const confirmEmployeePin = () => {
    if (employeePin.length < 6) return
    if (selected && !selected.require_manager_approval) {
      const isClockedIn = clockedInIds.has(selected.id)
      const isOnBreak   = onBreakIds.has(selected.id)
      let action: string
      if (!isClockedIn && !isOnBreak) action = 'clock_in'
      else if (isOnBreak) action = 'back_to_work'
      else action = pendingAction
      goToPhoto(action)
    } else {
      setStep('manager_pin')
    }
  }

  // In pin_first_confirm, employee already identified — confirm action directly
  const confirmPinFirstAction = () => {
    if (!selected) return
    if (selected.require_manager_approval) {
      setStep('manager_pin')
    } else {
      const isClockedIn = clockedInIds.has(selected.id)
      const isOnBreak   = onBreakIds.has(selected.id)
      let action: string
      if (!isClockedIn && !isOnBreak) action = 'clock_in'
      else if (isOnBreak) action = 'back_to_work'
      else action = pendingAction
      goToPhoto(action)
    }
  }

  // ─── Final submit — called after photo confirmed ────────────────────────────
  const finalSubmit = async (photo: string | null) => {
    if (!selected || !shopId) return
    setSubmitting(true)
    const action  = pendingSubmitAction
    const empPin  = kioskMode === 'pin_first' ? pinFirstPin : employeePin
    try {
      const res = await fetch('/api/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          employee_id:       selected.id,
          employee_pin:      empPin,
          manager_pin:       managerPin,
          shift_schedule_id: selectedShift || null,
          shop_id:           shopId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Upload photo to Drive (non-blocking, after time-log succeeds)
      if (photo) uploadPhotoToDrive(photo, selected.name, action)

      const messages: Record<string, string> = {
        clock_in:     `Welcome, ${firstName(selected.name)}! You're clocked in.`,
        clock_out:    `See you, ${firstName(selected.name)}! You've clocked out.`,
        break_out:    `Enjoy your break, ${firstName(selected.name)}!`,
        back_to_work: `Welcome back, ${firstName(selected.name)}!`,
      }
      setResultMsg(messages[action] ?? 'Done!')
      setStep('success')
      fetchData()
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong')
      setStep('error')
    } finally {
      setSubmitting(false)
    }
  }

  // After manager approves, go to photo step
  const handleManagerPinConfirm = () => {
    if (!selected || managerPin.length < 6) return
    const isClockedIn = clockedInIds.has(selected.id)
    const isOnBreak   = onBreakIds.has(selected.id)
    let action: string
    if (!isClockedIn && !isOnBreak) action = 'clock_in'
    else if (isOnBreak) action = 'back_to_work'
    else action = pendingAction
    goToPhoto(action)
  }

  const fmt = (d: Date | null) =>
    d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:-- --'
  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''

  const filteredEmps = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  const shiftSelected = !!selectedShift
  const gridConfig    = getGridConfig(filteredEmps.length)

  // ─── STEP: PIN-first entry ──────────────────────────────────────────────────
  if (step === 'pin_first') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between shadow-sm flex-shrink-0">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#1D9E75', letterSpacing: '0.12em' }}>
              Employee Kiosk
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-gray-900" style={{ fontFamily: "'DM Mono', monospace" }}>
              {fmt(time)}
            </div>
            <div className="text-xs font-medium text-gray-500 mt-0.5">{fmtDate(time)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-white transition-colors"
              style={{ background: '#0F6E56' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>

        {/* PIN entry */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-100 px-6 py-6 w-full max-w-xs shadow-lg flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-1"
                style={{ background: '#E1F5EE' }}
              >
                👤
              </div>
              <div className="text-base font-semibold text-gray-900">Enter your PIN</div>
              <div className="text-xs text-gray-400 text-center">Enter your employee PIN to continue</div>
            </div>

            {pinFirstError && (
              <div className="w-full text-center text-xs font-medium px-3 py-2 rounded-xl" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                {pinFirstError}
              </div>
            )}

            <PinPad value={pinFirstPin} onChange={setPinFirstPin} />

            {pinFirstLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#1D9E75', borderTopColor: 'transparent' }} />
                Looking up employee...
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: PIN-first confirm action ─────────────────────────────────────────
  if (step === 'pin_first_confirm' && selected) {
    const isClockedIn = clockedInIds.has(selected.id)
    const isOnBreak   = onBreakIds.has(selected.id)
    const shade       = avatarShade(selected.name)
    const fName       = firstName(selected.name)

    const actionLabel = isOnBreak
      ? 'Back to Work'
      : !isClockedIn
      ? 'Clock In'
      : pendingAction === 'break_out'
      ? 'Take a Break'
      : 'Clock Out'

    const badgeStyle = isOnBreak
      ? { background: '#FFF3CD', color: '#856404' }
      : isClockedIn
      ? { background: '#E1F5EE', color: '#0F6E56' }
      : { background: '#f3f4f6', color: '#6b7280' }

    // Shift picker needed only for clock-in
    const needsShift = !isClockedIn && !isOnBreak && !selectedShift

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5 w-full max-w-xs shadow-lg flex flex-col items-center gap-4">
          {/* Employee card */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-white flex-shrink-0"
              style={{ background: shade.bg, boxShadow: `0 0 0 4px ${shade.ring}` }}
            >
              {fName}
            </div>
            <div className="text-base font-semibold text-gray-900 leading-tight">{selected.name}</div>
            <div className="text-xs text-gray-400">{selected.role}</div>
            <div className="text-xs font-medium px-3 py-0.5 rounded-full mt-0.5" style={badgeStyle}>
              {isOnBreak ? 'Currently on break' : isClockedIn ? 'Currently on shift' : 'Not clocked in'}
            </div>
          </div>

          {/* Shift picker — only for clock-in */}
          {!isClockedIn && !isOnBreak && shifts.length > 0 && (
            <div className="w-full">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#0F6E56' }}>Select shift</p>
              <div className="flex flex-col gap-1.5">
                {shifts.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedShift(s.id)}
                    className="w-full px-3 py-2 rounded-xl text-sm font-medium border text-left transition-all"
                    style={selectedShift === s.id
                      ? { background: '#0F6E56', color: 'white', borderColor: '#0F6E56' }
                      : { background: 'white', color: '#374151', borderColor: '#d1d5db' }
                    }
                  >
                    {s.name}
                    <span className="ml-2 opacity-60 text-xs">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action picker — manual break mode, clocked in, not on break */}
          {breakMode === 'manual' && isClockedIn && !isOnBreak && (
            <div className="flex items-center gap-1 w-full bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setPendingAction('break_out')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  pendingAction === 'break_out'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Take a Break
              </button>
              <button
                onClick={() => setPendingAction('clock_out')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  pendingAction === 'clock_out'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Clock Out
              </button>
            </div>
          )}

          {/* Action button */}
          <div className="flex gap-2 w-full">
            <button
              onClick={resetKiosk}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmPinFirstAction}
              disabled={needsShift || submitting}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-all"
              style={{ background: isOnBreak ? '#D97706' : '#0F6E56' }}
            >
              {submitting ? 'Processing...' : actionLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: Select Employee (show_all mode) ──────────────────────────────────
  if (step === 'select') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm flex-shrink-0">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#1D9E75', letterSpacing: '0.12em' }}>
              Employee Kiosk
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-gray-900" style={{ fontFamily: "'DM Mono', monospace" }}>
              {fmt(time)}
            </div>
            <div className="sm:hidden mt-1">
              <div className="text-xs font-medium text-gray-600">{fmtDate(time)}</div>
              <div className="text-xs text-gray-400">Select your name to clock in or out</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="hidden sm:block text-right mr-2">
              <div className="text-sm font-medium text-gray-700">{fmtDate(time)}</div>
              <div className="text-xs text-gray-400 mt-1">Select your name to clock in or out</div>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => router.push('/staff')}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Staff</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-white transition-colors"
              style={{ background: '#0F6E56' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: '#1D9E75', borderTopColor: 'transparent' }} />
            <span className="text-sm text-gray-400">Loading employees...</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col px-4 sm:px-8 pt-4 sm:pt-6 pb-6 sm:pb-8 w-full max-w-6xl mx-auto">

            {/* Shift selector */}
            <div className="mb-6 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#0F6E56' }}>
                  Select your shift
                </p>
                {!shiftSelected && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FFF3CD', color: '#856404' }}>
                    Required for clocking in
                  </span>
                )}
                {shiftSelected && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                    ✓ Shift selected
                  </span>
                )}
              </div>
              {shifts.length === 0 ? (
                <div className="text-sm text-gray-400 bg-white border border-gray-200 rounded-2xl px-5 py-3 inline-block">
                  No active shifts found — add shifts in HR → Shift Settings
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {shifts.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedShift(s.id)}
                      className="px-5 py-2.5 rounded-full text-sm font-medium border transition-all duration-150"
                      style={selectedShift === s.id
                        ? { background: '#0F6E56', color: 'white', borderColor: '#0F6E56', boxShadow: '0 0 0 3px #9FE1CB' }
                        : { background: 'white', color: '#4b5563', borderColor: '#d1d5db' }
                      }
                    >
                      {s.name}
                      <span className="ml-2 opacity-60 text-xs">
                        {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-5 flex-shrink-0">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name..."
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-base focus:outline-none shadow-sm transition-all"
                style={{ borderColor: search ? '#5DCAA5' : '' }}
              />
            </div>

            {/* Employee Grid */}
            <div className={`grid ${gridConfig.cols} gap-4 flex-1`}>
              {filteredEmps.map(emp => {
                const active    = clockedInIds.has(emp.id)
                const onBreak   = onBreakIds.has(emp.id)
                const shade     = avatarShade(emp.name)
                const fName     = firstName(emp.name)
                const locked    = !active && !onBreak && !shiftSelected

                const cardStyle = onBreak
                  ? { borderColor: '#FAC775', background: '#FFFBEB', boxShadow: '0 0 0 1px #FAC775' }
                  : active
                  ? { borderColor: '#5DCAA5', background: '#f0fdf9', boxShadow: '0 0 0 1px #9FE1CB' }
                  : { borderColor: '#e5e7eb' }

                const dotColor   = onBreak ? '#D97706' : '#1D9E75'
                const badgeLabel = onBreak
                  ? 'On Break'
                  : active
                  ? breakMode === 'manual' ? 'On Shift' : 'Clocked in'
                  : 'Tap to clock in'
                const badgeStyle = onBreak
                  ? { background: '#FEF3C7', color: '#92400E' }
                  : active
                  ? { background: '#E1F5EE', color: '#0F6E56' }
                  : { background: '#f3f4f6', color: '#9ca3af' }

                return (
                  <button
                    key={emp.id}
                    onClick={() => selectEmployee(emp)}
                    disabled={locked}
                    className={`relative flex flex-col items-center justify-center gap-3 rounded-3xl border bg-white transition-all duration-150 ${gridConfig.cardPadding} ${
                      locked
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:scale-[1.03] active:scale-[0.97] hover:shadow-md cursor-pointer'
                    }`}
                    style={!locked ? cardStyle : { borderColor: '#e5e7eb' }}
                  >
                    {(active || onBreak) && (
                      <span
                        className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                        style={{ background: dotColor, boxShadow: '0 0 0 2px white' }}
                      />
                    )}
                    <div
                      className={`${gridConfig.avatarSize} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 transition-all duration-150`}
                      style={{
                        background: shade.bg,
                        boxShadow: (active || onBreak) ? `0 0 0 4px ${shade.ring}` : 'none',
                        fontSize: gridConfig.avatarText.replace('text-', ''),
                      }}
                    >
                      <span className={`${gridConfig.avatarText} font-semibold leading-none text-center`}>
                        {fName}
                      </span>
                    </div>
                    <div className="text-center w-full px-1">
                      <div className={`${gridConfig.nameText} font-semibold text-gray-900 leading-snug truncate`}>
                        {emp.name}
                      </div>
                      <div className={`${gridConfig.roleText} capitalize mt-0.5 truncate`} style={{ color: '#6b7280' }}>
                        {emp.role}
                      </div>
                    </div>
                    <span
                      className={`${gridConfig.badgeText} font-medium rounded-full`}
                      style={badgeStyle}
                    >
                      {badgeLabel}
                    </span>
                  </button>
                )
              })}
            </div>

            {filteredEmps.length === 0 && !loading && (
              <div className="text-center text-gray-400 py-20 text-sm">No employees found.</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── STEP: Employee PIN (show_all mode) ─────────────────────────────────────
  if (step === 'employee_pin') {
    const isClockedIn = selected ? clockedInIds.has(selected.id) : false
    const isOnBreak   = selected ? onBreakIds.has(selected.id)   : false
    const shade = selected ? avatarShade(selected.name) : TEAL_SHADES[0]
    const fName = selected ? firstName(selected.name) : ''

    const actionLabel = isOnBreak
      ? 'Back to Work'
      : !isClockedIn
      ? 'Clocking In'
      : pendingAction === 'break_out'
      ? 'Taking a Break'
      : 'Clocking Out'

    const badgeStyle = isOnBreak
      ? { background: '#FFF3CD', color: '#856404' }
      : isClockedIn
      ? { background: '#E1F5EE', color: '#0F6E56' }
      : { background: '#f3f4f6', color: '#6b7280' }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 w-full max-w-xs shadow-lg flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold text-white flex-shrink-0"
              style={{ background: shade.bg, boxShadow: `0 0 0 4px ${shade.ring}` }}
            >
              {fName}
            </div>
            <div className="text-base font-semibold text-gray-900 leading-tight">{selected?.name}</div>
            <div className="text-xs font-medium px-3 py-0.5 rounded-full" style={badgeStyle}>
              {actionLabel}
            </div>
          </div>

          {breakMode === 'manual' && isClockedIn && !isOnBreak && (
            <div className="flex items-center gap-1 w-full bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setPendingAction('break_out')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  pendingAction === 'break_out'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Take a Break
              </button>
              <button
                onClick={() => setPendingAction('clock_out')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  pendingAction === 'clock_out'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Clock Out
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400">Enter your PIN</p>
          <PinPad value={employeePin} onChange={setEmployeePin} />

          <div className="flex gap-2 w-full pt-1">
            <button
              onClick={resetKiosk}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmEmployeePin}
              disabled={employeePin.length < 6}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-all"
              style={{ background: '#0F6E56' }}
            >
              {selected && !selected.require_manager_approval ? 'Confirm' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: Manager PIN ──────────────────────────────────────────────────────
  if (step === 'manager_pin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 w-full max-w-xs shadow-lg flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: '#FFF8E1', border: '1px solid #FAC775' }}>
              🔐
            </div>
            <div className="text-base font-semibold text-gray-900">Manager Approval</div>
            <div className="text-xs text-gray-400 text-center leading-relaxed">
              A manager or owner must enter their PIN to approve
            </div>
          </div>
          <PinPad value={managerPin} onChange={setManagerPin} />
          <div className="flex gap-2 w-full pt-1">
            <button
              onClick={() => { setManagerPin(''); setStep(kioskMode === 'pin_first' ? 'pin_first_confirm' : 'employee_pin') }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleManagerPinConfirm}
              disabled={managerPin.length < 6 || submitting}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-all"
              style={{ background: '#0F6E56' }}
            >
              {submitting ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: Photo capture ────────────────────────────────────────────────────
  if (step === 'photo' && selected) {
    const shade = avatarShade(selected.name)
    const fName = firstName(selected.name)
    const actionLabels: Record<string, string> = {
      clock_in:     'Clocking In',
      clock_out:    'Clocking Out',
      break_out:    'Going on Break',
      back_to_work: 'Back to Work',
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg w-full max-w-sm overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
              style={{ background: shade.bg, boxShadow: `0 0 0 3px ${shade.ring}` }}
            >
              {fName}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{selected.name}</div>
              <div className="text-xs font-medium" style={{ color: '#1D9E75' }}>
                {actionLabels[pendingSubmitAction] ?? 'Clock event'}
              </div>
            </div>
          </div>

          {/* Camera / preview */}
          <div className="relative bg-gray-900" style={{ aspectRatio: '4/3' }}>
            {!capturedPhoto ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#1D9E75', borderTopColor: 'transparent' }} />
                    <span className="text-xs text-gray-300">Starting camera...</span>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="text-4xl">📷</div>
                    <div className="text-sm text-white font-medium">Camera unavailable</div>
                    <div className="text-xs text-gray-400">Allow camera access in your browser, or skip the photo</div>
                  </div>
                )}
                {cameraReady && (
                  <div className="absolute inset-0 pointer-events-none">
                    {[['top-4 left-4', 'border-t-2 border-l-2'],['top-4 right-4', 'border-t-2 border-r-2'],['bottom-4 left-4', 'border-b-2 border-l-2'],['bottom-4 right-4', 'border-b-2 border-r-2']].map(([pos, borders], i) => (
                      <div key={i} className={`absolute ${pos} w-6 h-6 ${borders}`} style={{ borderColor: '#1D9E75' }} />
                    ))}
                    <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/60">Look at the camera</div>
                  </div>
                )}
              </>
            ) : (
              <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            )}
          </div>

          {/* Buttons */}
          <div className="p-4 flex flex-col gap-2">
            {!capturedPhoto ? (
              <>
                <button
                  onClick={takeSnapshot}
                  disabled={!cameraReady && !cameraError}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: '#0F6E56' }}
                >
                  <span>📷</span> Take Photo
                </button>
                {cameraError && (
                  <button
                    onClick={() => finalSubmit(null)}
                    disabled={submitting}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {submitting ? 'Submitting...' : 'Skip photo & Submit'}
                  </button>
                )}
                <button onClick={resetKiosk} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => finalSubmit(capturedPhoto)}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: '#0F6E56' }}
                >
                  {submitting
                    ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} /> Submitting...</>
                    : <>✓ Submit Photo</>}
                </button>
                <button onClick={retakePhoto} disabled={submitting} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  Retake
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── STEP: Success ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#f0fdf9', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div className="text-center">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl text-white mx-auto mb-6 animate-bounce"
            style={{ background: '#1D9E75' }}
          >
            ✓
          </div>
          <div className="text-3xl font-semibold mb-2" style={{ color: '#085041' }}>{resultMsg}</div>
          <div className="text-sm mt-2" style={{ color: '#0F6E56', fontFamily: "'DM Mono', monospace" }}>{fmt(time)}</div>
          <div className="text-xs mt-6" style={{ color: '#5DCAA5' }}>Returning to kiosk in 5 seconds...</div>
          <button
            onClick={resetKiosk}
            className="mt-5 px-8 py-2.5 rounded-2xl text-white text-sm font-medium hover:opacity-90 transition-all"
            style={{ background: '#0F6E56' }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ─── STEP: Error ────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: '#fff5f5', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div className="text-center">
          <div className="text-8xl mb-6">❌</div>
          <div className="text-2xl font-semibold text-red-800 mb-2">Unable to process</div>
          <div className="text-red-500 text-sm mt-2 max-w-xs">{errorMsg}</div>
          <div className="text-red-300 text-xs mt-6">Returning to kiosk in 5 seconds...</div>
          <button
            onClick={resetKiosk}
            className="mt-5 px-8 py-2.5 bg-red-600 text-white rounded-2xl text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return null
}
