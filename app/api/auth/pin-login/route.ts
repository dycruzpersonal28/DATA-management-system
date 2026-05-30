import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'

// POST /api/auth/pin-login
// Body: { pin: string, email?: string }
// Looks up employee by PIN, creates a Supabase session, sets cookies.
export async function POST(req: NextRequest) {
  try {
    const { pin, email } = await req.json()

    if (!pin || String(pin).trim().length < 4) {
      return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 })
    }

    const admin = createAdminClient()
    const cleanPin = String(pin).trim()

    // 1. Find employee by PIN (+ email if provided for disambiguation)
    let query = admin
      .from('employees')
      .select('id, auth_user_id, email, name, is_active')
      .eq('pin', cleanPin)

    if (email) {
      query = query.eq('email', email.trim().toLowerCase())
    }

    const { data: matches, error: lookupError } = await query

    if (lookupError) {
      console.error('PIN lookup error:', lookupError)
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    if (matches.length > 1) {
      // Multiple employees share this PIN — require email to disambiguate
      return NextResponse.json(
        { error: 'Multiple accounts share this PIN. Please enter your email to continue.' },
        { status: 409 }
      )
    }

    const employee = matches[0]

    if (!employee.is_active) {
      return NextResponse.json({ error: 'This account is inactive. Contact your manager.' }, { status: 403 })
    }

    if (!employee.auth_user_id) {
      return NextResponse.json({ error: 'No login account linked to this PIN.' }, { status: 403 })
    }

    // 2. Generate a session for this user via admin API
    const { data: sessionData, error: sessionError } = await admin.auth.admin.getUserById(employee.auth_user_id)

    if (sessionError || !sessionData?.user) {
      return NextResponse.json({ error: 'Could not find linked account.' }, { status: 500 })
    }

    // 3. Create a short-lived magic link and exchange it for a session
    //    This is the safest way to produce a real session without knowing the password.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: sessionData.user.email!,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` },
    })

    if (linkError || !linkData?.properties) {
      console.error('Link generation error:', linkError)
      return NextResponse.json({ error: 'Failed to create session.' }, { status: 500 })
    }

    // 4. Exchange the OTP token for a real session
    const { hashed_token, email: linkEmail } = linkData.properties as any

    // Build the response — we need to set cookies
    const response = NextResponse.json({ success: true })

    // Create a server supabase client that writes cookies to the response
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

    // Exchange the hashed token for an active session
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email: linkEmail ?? sessionData.user.email!,
      token_hash: hashed_token,
      type: 'magiclink',
    })

    if (verifyError || !verifyData?.session) {
      console.error('OTP verify error:', verifyError)
      return NextResponse.json({ error: 'Failed to verify session.' }, { status: 500 })
    }

    return response
  } catch (err: any) {
    console.error('PIN login error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
