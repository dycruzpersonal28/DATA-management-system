// /app/api/payroll/settings/route.ts
// Stores payroll default rates + other deductions as JSON in the shop record.
// Uses the same auth + admin pattern as /api/payroll/route.ts

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

interface PayrollSettings {
  late_deduction_per_minute: number
  sss_rate: number
  philhealth_rate: number
  pagibig_flat: number
  overtime_multiplier: number
  tax_rate: number
  other_deductions: { id: string; label: string; amount: number }[]
}

const DEFAULTS: PayrollSettings = {
  late_deduction_per_minute: 0,
  sss_rate: 4.5,
  philhealth_rate: 2.5,
  pagibig_flat: 100,
  overtime_multiplier: 1.25,
  tax_rate: 0,
  other_deductions: [],
}

async function getShopId(supabase: any, admin: any, userId: string) {
  const { data: appUser, error } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', userId)
    .single()
  if (error || !appUser) return null
  return appUser.shop_id as string
}

// ─── GET /api/payroll/settings ────────────────────────────────────────────────
// Returns the current payroll settings for this shop.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shop_id = await getShopId(supabase, admin, user.id)
  if (!shop_id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: shop, error } = await admin
    .from('shops')
    .select('payroll_settings')
    .eq('id', shop_id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings: PayrollSettings = { ...DEFAULTS, ...(shop?.payroll_settings ?? {}) }
  return NextResponse.json({ settings })
}

// ─── PATCH /api/payroll/settings ─────────────────────────────────────────────
// Saves payroll settings for this shop.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shop_id = await getShopId(supabase, admin, user.id)
  if (!shop_id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await req.json()

  // Merge with defaults so partial updates are safe
  const settings: PayrollSettings = {
    ...DEFAULTS,
    ...body,
    // Ensure other_deductions is always an array
    other_deductions: Array.isArray(body.other_deductions)
      ? body.other_deductions.filter((o: any) => o.label?.trim() && o.amount >= 0)
      : DEFAULTS.other_deductions,
  }

  const { error } = await admin
    .from('shops')
    .update({ payroll_settings: settings })
    .eq('id', shop_id)

  if (error) {
    // If payroll_settings column doesn't exist yet, tell the user clearly
    if (error.message.includes('column') || error.code === '42703') {
      return NextResponse.json({
        error: 'Missing column: run this SQL in Supabase → ALTER TABLE shops ADD COLUMN IF NOT EXISTS payroll_settings jsonb DEFAULT \'{}\'::jsonb;'
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settings })
}
