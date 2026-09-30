import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { UserOrganizationResponseDto } from '@/api/endpoints.schemas'
import { useOrganizationsControllerList } from '@/api/organizations/organizations'
import { authSession } from '@/lib/http/auth-session'
import { queryClient } from '@/lib/query-client'
import { useAuth } from './auth-context'

type OrgContextValue = {
  orgs: UserOrganizationResponseDto[]
  activeOrg: UserOrganizationResponseDto | null
  isLoading: boolean
  isError: boolean
  /** Kullanıcının hiç organizasyonu yok; org oluşturma akışı gösterilmeli. */
  needsOrg: boolean
  switchOrg: (orgId: string) => void
  refetch: () => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const activeOrgId = useSyncExternalStore(
    authSession.subscribeActiveOrgId,
    authSession.getActiveOrgId,
    () => null,
  )

  const { data, isLoading, isError, refetch } = useOrganizationsControllerList(
    { page: 1, limit: 200 },
    { query: { enabled: status === 'authenticated' } },
  )

  const orgs = useMemo(() => (data?.status === 200 ? data.data.items : []), [data])

  useEffect(() => {
    if (status !== 'authenticated' || orgs.length === 0) return
    const current = authSession.getActiveOrgId()
    const stillMember = current && orgs.some((org) => org.id === current)
    if (!stillMember) {
      authSession.setActiveOrgId(orgs[0].id)
    }
  }, [status, orgs])

  const activeOrg = useMemo(() => orgs.find((org) => org.id === activeOrgId) ?? null, [orgs, activeOrgId])

  const switchOrg = (orgId: string) => {
    authSession.setActiveOrgId(orgId)
    void queryClient.invalidateQueries({
      predicate: (query) => !(Array.isArray(query.queryKey) && query.queryKey[0] === '/api/v1/organizations'),
    })
  }

  const value: OrgContextValue = {
    orgs,
    activeOrg,
    isLoading: status === 'authenticated' && isLoading,
    isError,
    needsOrg: status === 'authenticated' && !isLoading && !isError && orgs.length === 0,
    switchOrg,
    refetch,
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrg, OrgProvider içinde kullanılmalı')
  }
  return ctx
}
