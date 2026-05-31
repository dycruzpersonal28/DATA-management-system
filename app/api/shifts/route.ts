import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function getCallerShop() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: caller } = await supabase
    .from('app_users')
    .select('role, shop_id')
    .eq('auth_user_id', user.id)
    .single()

  return caller
}

export async function GET() {
  try {
    const caller = await getCallerShop()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: shifts, error } = await admin
      .from('shift_schedules')
      .select('*')
      .eq('shop_id', caller.shop_id)
      .order('start_time', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ shifts })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getCallerShop()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'manager'].includes(caller.role?.toLowerCase()))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, start_time, end_time, is_overnight } = await req.json()
    if (!name || !start_time || !end_time)
      return NextResponse.json({ error: 'name, start_time, end_time are required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: shift, error } = await admin
      .from('shift_schedules')
      .insert({ shop_id: caller.shop_id, name, start_time, end_time, is_overnight: is_overnight ?? false })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ shift })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await getCallerShop()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'manager'].includes(caller.role?.toLowerCase()))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: shift, error } = await admin
      .from('shift_schedules')
      .update(updates)
      .eq('id', id)
      .eq('shop_id', caller.shop_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ shift })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await getCallerShop()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (caller.role?.toLowerCase() !== 'owner')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin
      .from('shift_schedules')
      .delete()
      .eq('id', id)
      .eq('shop_id', caller.shop_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
