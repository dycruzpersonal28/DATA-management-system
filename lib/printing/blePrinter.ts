'use client'

import { Capacitor } from '@capacitor/core'

// ── Generic BLE ESC/POS thermal printer support ──────────────────────────────
// Works with Xprinter, Goojprt, HOIN, MPT-II, and most generic Chinese BLE
// thermal printer modules — not tied to any single brand. Nearly all of these
// printers are built around a small handful of BLE-serial chipsets, so we try
// their known service/characteristic UUIDs first, then fall back to scanning
// the device's full GATT table for any writable characteristic. That fallback
// means a printer we've never seen before will still very likely work.
//
// Uses @capacitor-community/bluetooth-le, which talks to the phone's native
// Bluetooth stack — required because Web Bluetooth (navigator.bluetooth)
// does not work inside a Capacitor Android WebView.

export type BlePrinterDevice = { deviceId: string; name: string }

type Profile = { service: string; characteristic: string }

// Known service/characteristic pairs used across BLE thermal printer brands.
// Order matters slightly (most common first) but all are tried.
const PRINTER_PROFILES: Profile[] = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' }, // most common — Xprinter, Goojprt, HOIN, MPT-series
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' }, // common clone variant
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' }, // generic HM-10 style BLE-UART module
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' }, // TI CC254x based modules
  { service: '0000ffb0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffb1-0000-1000-8000-00805f9b34fb' }, // assorted newer clones
]

let bleClient: typeof import('@capacitor-community/bluetooth-le').BleClient | null = null
let initialized = false

async function getBleClient() {
  if (!bleClient) {
    const mod = await import('@capacitor-community/bluetooth-le')
    bleClient = mod.BleClient
  }
  if (!initialized) {
    await bleClient.initialize({ androidNeverForLocation: true })
    initialized = true
  }
  return bleClient
}

export function isNativeBluetoothAvailable() {
  return Capacitor.isNativePlatform()
}

// Service UUIDs to advertise as "optional" when falling back to Web
// Bluetooth, so the browser's GATT layer allows us to read/write them later.
const WEB_OPTIONAL_SERVICES = PRINTER_PROFILES.map(p => p.service)

/**
 * Single-shot "scan and pick one device" flow — shows the platform's native
 * device picker (Android) or the browser's Web Bluetooth picker (desktop
 * fallback) and resolves with the chosen device, or null if the user
 * cancelled. This is the simplest way to pair a printer: one button, one
 * picker, one result — matching a typical "Scan" button UX.
 */
export async function requestBlePrinter(): Promise<BlePrinterDevice | null> {
  if (isNativeBluetoothAvailable()) {
    try {
      const client = await getBleClient()
      const device = await client.requestDevice({ allowDuplicates: false })
      return { deviceId: device.deviceId, name: device.name || device.deviceId }
    } catch (err: any) {
      // User cancelled the picker or no device was selected — not an error
      if (err?.message && /cancel/i.test(err.message)) return null
      console.error('BLE requestDevice error:', err)
      throw err
    }
  }

  // Desktop browser fallback (e.g. testing in Chrome) — Web Bluetooth
  const bt = (navigator as any).bluetooth
  if (!bt) {
    throw new Error('Bluetooth pairing requires the installed Android app, or Chrome on a Bluetooth-capable desktop for testing.')
  }
  try {
    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: WEB_OPTIONAL_SERVICES,
    })
    const id = device.name || device.id
    return { deviceId: id, name: device.name || device.id }
  } catch (err: any) {
    if (err?.name === 'NotFoundError') return null // user cancelled
    throw err
  }
}

/**
 * Scan for nearby BLE devices for `timeoutMs`. Native app only — on web,
 * the browser shows its own device picker via requestDevice instead.
 */
export async function scanForPrinters(timeoutMs = 6000): Promise<BlePrinterDevice[]> {
  if (!isNativeBluetoothAvailable()) {
    throw new Error('Bluetooth scanning is only available in the installed app, not the browser.')
  }
  const client = await getBleClient()
  const found = new Map<string, BlePrinterDevice>()

  await client.requestLEScan({}, (result: any) => {
    const id = result?.device?.deviceId
    if (!id) return
    const name = result.device.name || result.localName || 'Unknown device'
    found.set(id, { deviceId: id, name })
  })

  await new Promise(resolve => setTimeout(resolve, timeoutMs))
  await client.stopLEScan().catch(() => {})

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name))
}

async function findWritableProfile(client: any, deviceId: string): Promise<{ profile: Profile; useWithoutResponse: boolean } | null> {
  const services = await client.getServices(deviceId)

  const charSupportsWrite = (c: any) => c?.properties?.write || c?.properties?.writeWithoutResponse
  const prefersWithoutResponse = (c: any) => !!c?.properties?.writeWithoutResponse

  // Try known printer profiles first
  for (const profile of PRINTER_PROFILES) {
    const svc = services.find((s: any) => s.uuid?.toLowerCase() === profile.service.toLowerCase())
    if (!svc) continue
    const char = svc.characteristics?.find((c: any) => c.uuid?.toLowerCase() === profile.characteristic.toLowerCase())
    if (char && charSupportsWrite(char)) {
      return { profile, useWithoutResponse: prefersWithoutResponse(char) }
    }
  }

  // Fallback: any writable characteristic on any service — maximizes
  // compatibility with printers we don't have a known profile for.
  for (const svc of services) {
    for (const char of svc.characteristics || []) {
      if (charSupportsWrite(char)) {
        return {
          profile: { service: svc.uuid, characteristic: char.uuid },
          useWithoutResponse: prefersWithoutResponse(char),
        }
      }
    }
  }
  return null
}

async function getSafeChunkSize(client: any, deviceId: string): Promise<number> {
  try {
    const mtu = await client.getMtu(deviceId)
    if (typeof mtu === 'number' && mtu > 23) return mtu - 3
  } catch {}
  return 20 // default BLE ATT MTU (23 bytes) minus 3-byte header — safe on every device
}

/**
 * Send raw ESC/POS bytes to a BLE thermal printer via the native plugin.
 * `deviceId` is the BLE address saved when the printer was paired
 * (see scanForPrinters / BluetoothPrinterPicker). Works with any generic
 * BLE ESC/POS printer, not a specific brand.
 */
export async function printToBlePrinter(deviceId: string, data: Uint8Array): Promise<boolean> {
  if (!isNativeBluetoothAvailable() || !deviceId) return false

  const client = await getBleClient()
  try {
    await client.connect(deviceId)

    const found = await findWritableProfile(client, deviceId)
    if (!found) {
      await client.disconnect(deviceId).catch(() => {})
      return false
    }
    const { profile, useWithoutResponse } = found

    const { numbersToDataView } = await import('@capacitor-community/bluetooth-le')
    const chunkSize = await getSafeChunkSize(client, deviceId)

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = Array.from(data.slice(i, i + chunkSize))
      const view = numbersToDataView(chunk)
      if (useWithoutResponse) {
        await client.writeWithoutResponse(deviceId, profile.service, profile.characteristic, view)
      } else {
        await client.write(deviceId, profile.service, profile.characteristic, view)
      }
    }

    await client.disconnect(deviceId)
    return true
  } catch (err) {
    console.error('BLE printer error:', err)
    try { await client.disconnect(deviceId) } catch {}
    return false
  }
}
