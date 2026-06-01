import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'

// POST /api/auth/pin-login
// Body: { pin: string, email?: string }
export async function POST(req: NextRequest) {
  try {
    const { pin, email } = await req.json()

    if (!pin || String(pin).trim().length < 6) {
      return NextResponse.json({ error: 'PIN must be 6 digits' }, { status: 400 })
    }

    const admin = createAdminClient()
    const cleanPin = String(pin).trim()

    // 1. Find employee by PIN
    let empQuery = admin
      .from('employees')
      .select('id, auth_user_id, email, name, is_active')
      .eq('pin', cleanPin)

    if (email) {
      empQuery = empQuery.eq('email', email.trim().toLowerCase())
    }

    const { data: matches, error: lookupError } = await empQuery

    if (lookupError || !matches || matches.length === 0) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    if (matches.length > 1) {
      return NextResponse.json(
        { error: 'Multiple accounts share this PIN. Please enter your email to continue.' },
        { status: 409 }
      )
    }

    const employee = matches[0]

    if (!employee.is_active) {
      return NextResponse.json({ error: 'This account is inactive. Contact your manager.' }, { status: 403 })
    }

    // 2. Get auth_user_id — check employee record first, then app_users as fallback
    let authUserId = employee.auth_user_id

    if (!authUserId) {
      const { data: appUser } = await admin
        .from('app_users')
        .select('auth_user_id')
        .eq('email', employee.email)
        .maybeSingle()

      authUserId = appUser?.auth_user_id ?? null
    }

    if (!authUserId) {
      return NextResponse.json({ error: 'No login account linked to this PIN.' }, { status: 403 })
    }

    // 3. Get the user's email from Supabase auth
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(authUserId)

    if (userError || !userData?.user?.email) {
      return NextResponse.json({ error: 'Could not find linked account.' }, { status: 500 })
    }

    const userEmail = userData.user.email

    // 4. Generate a magic link token and exchange it for a session
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Magic link generation error:', linkError)
      return NextResponse.json({ error: 'Failed to create session.' }, { status: 500 })
    }

    // 5. Exchange the token for a session using the anon client
    const anonClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll() },
          setAll() {},
        },
      }
    )

    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      type: 'magiclink',
      email: userEmail,
      token_hash: linkData.properties.hashed_token,
    })

    if (verifyError || !verifyData?.session) {
      console.error('Session verification error:', verifyError)
      return NextResponse.json({ error: 'Failed to create session.' }, { status: 500 })
    }

    // 6. Set session cookies on the response
    const response = NextResponse.json({ success: true })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    await supabase.auth.setSession({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    })

    return response
  } catch (err: any) {
    console.error('PIN login error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
