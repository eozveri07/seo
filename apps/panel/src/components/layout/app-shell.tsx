import type { ReactNode } from 'react'
import { AppSidebar } from './app-sidebar'
import { AppTopbar } from './app-topbar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-svh w-full">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
