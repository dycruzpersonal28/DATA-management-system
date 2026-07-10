// app/api/shop/receipt/route.ts
// GET/PATCH /api/shop/receipt — read & update receipt branding for the
// current user's shop (logo, header text, footer text) only.
//
// This is intentionally separate from /api/shop's PATCH: that route
// rebuilds the whole shop row (name, currency, printer config, etc.) on
// every save, so routing receipt-only saves through it would silently
// reset unrelated fields to their defaults. This route only ever touches
// receipt_header / receipt_footer / logo_url.
//
// Uses the admin client + a manual auth/shop lookup (same pattern as
// /api/shop and /api/inventory/movements) instead of writing to Supabase
// directly from the browser, so it isn't dependent on RLS policies on the
// `shops` table being configured for client-side writes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function resolveShopId(supabase: any, admin: any) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: appUser } = await admin
    .from('app_users')
    .select('shop_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!appUser) return { error: 'Shop not found', status: 404 }

  return { shop_id: appUser.shop_id }
}

export async function GET() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const resolved = await resolveShopId(supabase, admin)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { data: shop, error } = await admin
    .from('shops')
    .select('id, name, receipt_header, receipt_footer, logo_url')
    .eq('id', resolved.shop_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shop })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const resolved = await resolveShopId(supabase, admin)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const body = await req.json()
  const { receipt_header, receipt_footer, logo_url } = body

  // Partial update — only touch fields that were actually sent, so a save
  // from this page can never clobber unrelated shop columns.
  const updates: Record<string, any> = {}
  if (receipt_header !== undefined) updates.receipt_header = receipt_header
  if (receipt_footer !== undefined) updates.receipt_footer = receipt_footer
  if (logo_url       !== undefined) updates.logo_url       = logo_url

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: shop, error } = await admin
    .from('shops')
    .update(updates)
    .eq('id', resolved.shop_id)
    .select('id, name, receipt_header, receipt_footer, logo_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shop })
}
