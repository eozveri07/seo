import { authSession } from './auth-session'
import { refreshAccessToken } from './refresh-queue'

const REFRESH_PATH = '/api/v1/auth/refresh'

function buildHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  const token = authSession.getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const orgId = authSession.getActiveOrgId()
  if (orgId) {
    headers.set('X-Org-Id', orgId)
  }
  return headers
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(REFRESH_PATH, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      authSession.clear()
      return false
    }
    const data = (await response.json().catch(() => null)) as { accessToken?: string } | null
    if (!data?.accessToken) {
      authSession.clear()
      return false
    }
    authSession.setAccessToken(data.accessToken)
    return true
  } catch {
    authSession.clear()
    return false
  }
}

async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    return undefined as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

/**
 * orval fetch mutator. A 401 (other than from the refresh call itself) triggers
 * one refresh attempt shared by every request in flight (`refreshAccessToken`);
 * the original request is retried once refresh succeeds, otherwise the session
 * is cleared and the 401 response is returned as-is. Response shape matches
 * what orval's generated hooks expect: `{ status, data, headers }`.
 */
export const customFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const isRefreshCall = url.endsWith(REFRESH_PATH)
  const send = () =>
    fetch(url, {
      ...options,
      headers: buildHeaders(options.headers),
    })

  let response = await send()

  if (response.status === 401 && !isRefreshCall) {
    const refreshed = await refreshAccessToken(performRefresh)
    if (refreshed) {
      response = await send()
    }
  }

  const data = await parseBody(response)
  return { status: response.status, data, headers: response.headers } as T
}

export default customFetch
