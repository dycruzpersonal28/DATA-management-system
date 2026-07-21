'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

const FULL_ACCESS_ROLES = ['owner', 'manager']

export default function DashboardShell({
  role,
  shop,
  userName,
  children,
}: {
  role: string
  shop: any
  userName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isFullAccess = FULL_ACCESS_ROLES.includes(role?.toLowerCase())

  // Staff (non owner/manager) viewing /transactions get a full-screen view,
  // no sidebar. Owner/manager always see the full layout everywhere.
  const hideSidebar = !isFullAccess && pathname.startsWith('/transactions')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {!hideSidebar && (
        <Sidebar shop={shop} userName={userName} userRole={role} />
      )}
      <main
        className={`flex-1 overflow-y-auto overflow-x-hidden min-w-0 ${
          hideSidebar ? '' : 'pt-14 lg:pt-0'
        }`}
      >
        {children}
      </main>
    </div>
  )
}
