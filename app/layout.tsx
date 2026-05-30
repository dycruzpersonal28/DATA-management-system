import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { Providers } from '@/lib/providers'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'POS System',
  description: 'Point of Sale Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={dmSans.className}>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
