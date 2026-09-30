export type AuthTokens = {
  accessToken: string
}

const ACTIVE_ORG_STORAGE_KEY = 'seo-platform.active-org-id'

function readStoredActiveOrgId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredActiveOrgId(orgId: string | null): void {
  try {
    if (orgId) {
      window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId)
    } else {
      window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
    }
  } catch {
    // localStorage kullanılamıyor (gizli mod, kota vb.); aktif org yalnız bellekte tutulur.
  }
}

let accessToken: string | null = null
let activeOrgId: string | null = readStoredActiveOrgId()
const activeOrgListeners = new Set<() => void>()

function notifyActiveOrgListeners(): void {
  for (const listener of activeOrgListeners) listener()
}

export const authSession = {
  getAccessToken(): string | null {
    return accessToken
  },
  setAccessToken(token: string | null): void {
    accessToken = token
  },
  getActiveOrgId(): string | null {
    return activeOrgId
  },
  setActiveOrgId(orgId: string | null): void {
    activeOrgId = orgId
    writeStoredActiveOrgId(orgId)
    notifyActiveOrgListeners()
  },
  /** `useSyncExternalStore` ile aktif org değişimini React'e bildirmek için. */
  subscribeActiveOrgId(listener: () => void): () => void {
    activeOrgListeners.add(listener)
    return () => activeOrgListeners.delete(listener)
  },
  clear(): void {
    accessToken = null
    activeOrgId = null
    writeStoredActiveOrgId(null)
    notifyActiveOrgListeners()
  },
}
