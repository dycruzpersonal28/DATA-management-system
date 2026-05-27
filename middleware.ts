import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthPage = pathname === '/login' || pathname === '/pin' ||
                     pathname.startsWith('/login') || pathname.startsWith('/pin')
  const isApiRoute = pathname.startsWith('/api')
  const isPublic   = isAuthPage || isApiRoute

  // Not logged in → redirect to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Already logged in → check role before redirecting
  if (user && isAuthPage) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    const url = request.nextUrl.clone()
    // Cashiers go straight to POS, everyone else to dashboard
    url.pathname = appUser?.role === 'cashier' ? '/pos' : '/dashboard'
    return NextResponse.redirect(url)
  }

  // Logged-in cashier trying to access non-POS pages → redirect to POS
  if (user && !isPublic) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    const isPosPage = pathname.startsWith('/pos')

    if (appUser?.role === 'cashier' && !isPosPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/pos'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}