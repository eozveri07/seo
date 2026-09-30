import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UserResponseDto } from '@/api/endpoints.schemas'
import { meControllerMe } from '@/api/users/users'
import { authControllerLogout } from '@/api/auth/auth'
import { authSession } from '@/lib/http/auth-session'
import { performRefresh } from '@/lib/http/custom-fetch'
import { refreshAccessToken } from '@/lib/http/refresh-queue'
import { queryClient } from '@/lib/query-client'

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  status: AuthStatus
  user: UserResponseDto | null
  /** Yeni giriş ya da davet kabulünden sonra oturumu kurar. */
  setSession: (accessToken: string, user: UserResponseDto) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<UserResponseDto | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const refreshed = await refreshAccessToken(performRefresh)
      if (!refreshed) {
        if (!cancelled) setStatus('unauthenticated')
        return
      }
      const response = await meControllerMe().catch(() => null)
      if (cancelled) return
      if (response && response.status === 200) {
        setUser(response.data)
        setStatus('authenticated')
      } else {
        authSession.clear()
        setStatus('unauthenticated')
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const setSession = useCallback((accessToken: string, nextUser: UserResponseDto) => {
    authSession.setAccessToken(accessToken)
    setUser(nextUser)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    await authControllerLogout().catch(() => null)
    authSession.clear()
    queryClient.clear()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, setSession, logout }),
    [status, user, setSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  }
  return ctx
}
