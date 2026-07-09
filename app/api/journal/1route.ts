import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── GET: list journal entries ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('shop_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const date_from = searchParams.get('date_from')
    const date_to   = searchParams.get('date_to')
    const type      = searchParams.get('type')

    const admin = createAdminClient()
    let query = admin
      .from('journal_entries')
      .select(`
        id, type, category, amount, description, reference_no,
        date, is_recurring, recurring_day, created_at,
        created_by_user:app_users!journal_entries_created_by_fkey ( id )
      `)
      .eq('shop_id', caller.shop_id)
      .order('date', { ascending: false })

    if (date_from) query = query.gte('date', date_from)
    if (date_to)   query = query.lte('date', date_to)
    if (type)      query = query.eq('type', type)

    const { data: entries, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ entries })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST: create journal entry ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('id, shop_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const {
      type,           // 'expense' | 'other_income' | 'labor' | 'capital'
      category,
      amount,
      description,
      reference_no,
      date,
      is_recurring,
      recurring_day,
      reference_type: customReferenceType,
      reference_id: customReferenceId,
    } = body

    if (!type || !category || !amount || !date) {
      return NextResponse.json({ error: 'type, category, amount, and date are required' }, { status: 400 })
    }

    const validTypes = ['expense', 'other_income', 'labor', 'capital']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Insert into journal_entries (the source-of-truth for the form entry)
    const { data: entry, error: entryError } = await admin
      .from('journal_entries')
      .insert({
        shop_id: caller.shop_id,
        type,
        category,
        amount: Number(amount),
        description: description || null,
        reference_no: reference_no || null,
        date,
        is_recurring: is_recurring || false,
        recurring_day: is_recurring ? (recurring_day || null) : null,
        created_by: caller.id,
      })
      .select()
      .single()

    if (entryError) throw entryError

    // 2. Mirror into financial_entries so existing P&L queries pick it up automatically
    // Direction: income types go 'in', expense types go 'out'
    const direction = ['other_income', 'capital'].includes(type) ? 'in' : 'out'

    // Map journal type → financial_entries type
    // 'expense'      → 'expense'
    // 'other_income' → 'revenue'  (shows in revenue total)
    // 'labor'        → 'labor'
    // 'capital'      → 'capital'
    const financialType = type === 'other_income' ? 'revenue' : type

    const { error: finError } = await admin
      .from('financial_entries')
      .insert({
        shop_id: caller.shop_id,
        entry_date: date,
        type: financialType,
        category,
        amount: Number(amount),
        direction,
        reference_type: customReferenceType ?? 'journal',
        reference_id: customReferenceId ?? entry.id,
        note: description || `${type}: ${category}`,
      })

    if (finError) throw finError

    return NextResponse.json({ success: true, entry })
  } catch (err: any) {
    console.error('[POST /api/journal]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: remove a journal entry + its financial_entries mirror ────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await supabase
      .from('app_users')
      .select('role, shop_id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller || !['owner', 'manager'].includes(caller.role?.toLowerCase()))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })

    const admin = createAdminClient()

    // Remove financial_entries mirror first
    await admin
      .from('financial_entries')
      .delete()
      .eq('reference_type', 'journal')
      .eq('reference_id', id)
      .eq('shop_id', caller.shop_id)

    // Remove journal entry
    const { error } = await admin
      .from('journal_entries')
      .delete()
      .eq('id', id)
      .eq('shop_id', caller.shop_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
