import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingState } from '@/components/common/state-views'
import { useAuth } from '@/lib/auth/auth-context'
import { useOrg } from '@/lib/auth/org-context'

export const Route = createFileRoute('/_app')({
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const { status } = useAuth()
  const { isLoading, needsOrg, activeOrg } = useOrg()

  if (status === 'checking') {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <LoadingState rows={2} />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <LoadingState rows={2} />
      </div>
    )
  }

  if (needsOrg) {
    return <Navigate to="/organizations/new" />
  }

  if (!activeOrg) {
    return null
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
