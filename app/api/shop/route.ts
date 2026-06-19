// app/api/shop/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/shop — fetch the current user's shop
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: shop, error } = await admin
    .from('shops')
    .select('*')
    .eq('id', appUser.shop_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ shop })
}

// PATCH /api/shop — update the current user's shop settings
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (appUser.role?.toLowerCase() !== 'owner') {
    return NextResponse.json({ error: 'Forbidden: only owners can update shop settings' }, { status: 403 })
  }

  const body = await req.json()
  const {
    name,
    address,
    phone,
    email,
    currency,
    currency_symbol,
    timezone,
    receipt_printer_type,
    receipt_printer_address,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Store name is required' }, { status: 400 })
  }

  const VALID_PRINTER_TYPES = ['none', 'network', 'bluetooth']
  if (receipt_printer_type !== undefined && !VALID_PRINTER_TYPES.includes(receipt_printer_type)) {
    return NextResponse.json({ error: 'Invalid receipt printer type' }, { status: 400 })
  }
  if (
    (receipt_printer_type === 'network' || receipt_printer_type === 'bluetooth') &&
    !receipt_printer_address?.trim()
  ) {
    return NextResponse.json({ error: 'Receipt printer address is required for the selected connection type' }, { status: 400 })
  }

  const { data: shop, error } = await admin
    .from('shops')
    .update({
      name:            name.trim(),
      address:         address?.trim() ?? '',
      phone:           phone?.trim() ?? '',
      email:           email?.trim() ?? '',
      currency:        currency ?? 'PHP',
      currency_symbol: currency_symbol ?? '₱',
      timezone:        timezone ?? 'Asia/Manila',
      receipt_printer_type:    receipt_printer_type ?? 'none',
      receipt_printer_address: receipt_printer_type === 'none' ? '' : (receipt_printer_address?.trim() ?? ''),
    })
    .eq('id', appUser.shop_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ shop })
}
