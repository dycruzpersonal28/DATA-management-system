'use client'

import React, { createContext, useContext } from 'react'

type PermissionsContextValue = {
  permissions: string[]
  hasPermission: (name: string) => boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: [],
  hasPermission: () => false,
})

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: string[]
  children: React.ReactNode
}) {
  const value: PermissionsContextValue = {
    permissions,
    hasPermission: (name: string) => permissions.includes(name),
  }
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
