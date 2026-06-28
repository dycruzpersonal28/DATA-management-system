// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code provided' }, { status: 400 })

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await oauth2Client.getToken(code)

  // Save tokens to a local file
  const tokenPath = path.join(process.cwd(), 'google-tokens.json')
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))

  return new NextResponse(`
    <html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>✅ Google Drive connected!</h2>
      <p>You can close this tab and go back to your app.</p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
