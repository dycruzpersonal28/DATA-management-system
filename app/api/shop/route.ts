// app/api/shop/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: shop, error } = await admin
    .from('shops')
    .select(`
      id, name, address, phone, email,
      currency, currency_symbol, timezone,
      tax_inclusive, loyalty_enabled, kds_enabled,
      printer_enabled, logo_url,
      receipt_header, receipt_footer,
      points_per_dollar, points_redemption_rate,
      receipt_printer_type, receipt_printer_address,
      kds_printer_type, kds_printer_address,
      feature_shifts, feature_timeclock,
      feature_open_tickets, feature_kitchen_printers,
      feature_dining_options,
      created_at, updated_at
    `)
    .eq('id', appUser.shop_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  return NextResponse.json({ shop })
}
