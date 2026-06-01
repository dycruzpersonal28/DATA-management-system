// app/api/payroll/settings/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Default settings — returned when no row exists yet ──────────────────────
const DEFAULTS = {
  late_deduction_per_minute: 0,
  sss_rate: 0,
  philhealth_rate: 0,
  pagibig_flat: 0,
  overtime_multiplier: 1,
  tax_rate: 0,
  other_deductions: [] as { label: string; amount: number }[],
  payslip_notes: '',
  break_mode: 'auto' as 'auto' | 'manual',
  break_duration_minutes: 60,
  kiosk_mode: 'show_all' as 'show_all' | 'pin_first',
  late_deduction_type: 'per_minute' as 'flat' | 'per_minute',
}

// ─── Auth helper — returns caller's shop_id or throws ────────────────────────
async function getShopId(req: NextRequest): Promise<{ shop_id: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: caller } = await admin
    .from('app_users')
    .select('role, shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!caller) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!['owner', 'manager', 'admin'].includes(caller.role?.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { shop_id: caller.shop_id }
}

// ─── GET /api/payroll/settings ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await getShopId(req)
    if (auth instanceof NextResponse) return auth
    const { shop_id } = auth

    const admin = createAdminClient()
    const { data: row, error } = await admin
      .from('payroll_settings')
      .select('*')
      .eq('shop_id', shop_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings = row ? {
      late_deduction_per_minute: row.late_deduction_per_minute ?? DEFAULTS.late_deduction_per_minute,
      sss_rate:                  row.sss_rate                  ?? DEFAULTS.sss_rate,
      philhealth_rate:           row.philhealth_rate           ?? DEFAULTS.philhealth_rate,
      pagibig_flat:              row.pagibig_flat              ?? DEFAULTS.pagibig_flat,
      overtime_multiplier:       row.overtime_multiplier       ?? DEFAULTS.overtime_multiplier,
      tax_rate:                  row.tax_rate                  ?? DEFAULTS.tax_rate,
      other_deductions:          row.other_deductions          ?? DEFAULTS.other_deductions,
      payslip_notes:             row.payslip_notes             ?? DEFAULTS.payslip_notes,
      // ── Break settings ──────────────────────────────────────────────────────
      break_mode:                row.break_mode                ?? DEFAULTS.break_mode,
      break_duration_minutes:    row.break_duration_minutes    ?? DEFAULTS.break_duration_minutes,
      kiosk_mode:                row.kiosk_mode                ?? DEFAULTS.kiosk_mode,
      late_deduction_type:       row.late_deduction_type       ?? DEFAULTS.late_deduction_type,
    } : DEFAULTS

    // Fetch shop timezone
    const { data: shopRow } = await admin
      .from('shops')
      .select('timezone')
      .eq('id', shop_id)
      .single()
    const shop_timezone = shopRow?.timezone ?? 'Asia/Manila'

    return NextResponse.json({ settings, shop_timezone })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST /api/payroll/settings ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await getShopId(req)
    if (auth instanceof NextResponse) return auth
    const { shop_id } = auth

    const body = await req.json()
    const {
      late_deduction_per_minute,
      sss_rate,
      philhealth_rate,
      pagibig_flat,
      overtime_multiplier,
      tax_rate,
      other_deductions,
      payslip_notes,
      // ── Break settings ──────────────────────────────────────────────────────
      break_mode,
      break_duration_minutes,
      kiosk_mode,
      late_deduction_type,
    } = body

    const upsertData: Record<string, any> = { shop_id }

    if (late_deduction_per_minute !== undefined) upsertData.late_deduction_per_minute = late_deduction_per_minute
    if (sss_rate                  !== undefined) upsertData.sss_rate                  = sss_rate
    if (philhealth_rate           !== undefined) upsertData.philhealth_rate           = philhealth_rate
    if (pagibig_flat              !== undefined) upsertData.pagibig_flat              = pagibig_flat
    if (overtime_multiplier       !== undefined) upsertData.overtime_multiplier       = overtime_multiplier
    if (tax_rate                  !== undefined) upsertData.tax_rate                  = tax_rate
    if (other_deductions          !== undefined) upsertData.other_deductions          = other_deductions
    if (payslip_notes             !== undefined) upsertData.payslip_notes             = payslip_notes
    // ── Break settings ────────────────────────────────────────────────────────
    if (break_mode                !== undefined) upsertData.break_mode                = break_mode
    if (break_duration_minutes    !== undefined) upsertData.break_duration_minutes    = break_duration_minutes
    if (kiosk_mode                !== undefined) upsertData.kiosk_mode                = kiosk_mode
    if (late_deduction_type       !== undefined) upsertData.late_deduction_type       = late_deduction_type

    const admin = createAdminClient()
    const { data: row, error } = await admin
      .from('payroll_settings')
      .upsert(upsertData, { onConflict: 'shop_id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: row })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
