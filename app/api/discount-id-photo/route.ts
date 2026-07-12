// app/api/discount-id-photo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { Readable } from 'stream'

function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  return oauth2Client
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, receiptNumber, discountName, idRef } = await req.json()

    if (!imageBase64 || !receiptNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Separate folder from the employee clock-in/out photos, per shop request.
    const folderId = process.env.GOOGLE_DRIVE_DISCOUNT_ID_FOLDER_ID
    if (!folderId) {
      return NextResponse.json({ error: 'GOOGLE_DRIVE_DISCOUNT_ID_FOLDER_ID not set' }, { status: 500 })
    }

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return NextResponse.json({ error: 'GOOGLE_REFRESH_TOKEN not set' }, { status: 500 })
    }

    const auth  = getOAuthClient()
    const drive = google.drive({ version: 'v3', auth })

    // Build filename — filed under the receipt number so it's easy to look up
    // the ID photo for any given sale later.
    const now      = new Date()
    const datePart = now.toISOString().slice(0, 10)
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-')
    const label    = discountName ?? 'Discount ID'
    const idPart   = idRef ? ` - ID ${idRef}` : ''
    const filename = `${receiptNumber} - ${label}${idPart} - ${datePart} ${timePart}.jpg`

    // Decode base64
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer     = Buffer.from(base64Data, 'base64')

    const bodyStream = new Readable({
      read() {
        this.push(buffer)
        this.push(null)
      },
    })

    const response = await drive.files.create({
      requestBody: {
        name:    filename,
        parents: [folderId],
      },
      media: {
        mimeType: 'image/jpeg',
        body:     bodyStream,
      },
      fields: 'id, name, webViewLink',
    })

    console.log('Discount ID photo upload success:', response.data.name)

    return NextResponse.json({
      success:     true,
      fileId:      response.data.id,
      name:        response.data.name,
      webViewLink: response.data.webViewLink,
    })

  } catch (err: any) {
    console.error('Discount ID photo upload error:', err?.message ?? err)
    return NextResponse.json(
      { error: err?.message ?? 'Upload failed' },
      { status: 500 }
    )
  }
}
