import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSession } from './auth-session'
import { customFetch } from './custom-fetch'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('customFetch', () => {
  beforeEach(() => {
    authSession.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    authSession.clear()
  })

  it('adds a Bearer header when an access token is set', async () => {
    authSession.setAccessToken('token-123')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await customFetch('/api/v1/things', {})

    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('adds an X-Org-Id header when an active org is set', async () => {
    authSession.setActiveOrgId('org-1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await customFetch('/api/v1/things', {})

    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('X-Org-Id')).toBe('org-1')
  })

  it('refreshes once on a 401 and retries the original request with the new token', async () => {
    authSession.setAccessToken('expired-token')
    const fetchMock = vi
      .fn()
      // first call to the protected endpoint -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: 'unauthorized' }))
      // refresh call -> new token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh-token' }))
      // retried protected endpoint -> 200
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await customFetch<{ status: number; data: { ok: boolean } }>(
      '/api/v1/things',
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include' })
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ ok: true })
    expect(authSession.getAccessToken()).toBe('fresh-token')
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token')
  })

  it('queues concurrent 401s behind a single refresh call', async () => {
    authSession.setAccessToken('expired-token')
    let refreshCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshCalls += 1
        return Promise.resolve(jsonResponse(200, { accessToken: 'fresh-token' }))
      }
      const headers = new Headers()
      // requests made before refresh completes still carry the stale token
      return Promise.resolve(jsonResponse(authSession.getAccessToken() === 'fresh-token' ? 200 : 401, { headers }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      customFetch<{ status: number }>('/api/v1/a', {}),
      customFetch<{ status: number }>('/api/v1/b', {}),
    ])

    expect(refreshCalls).toBe(1)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })

  it('clears the session when refresh fails', async () => {
    authSession.setAccessToken('expired-token')
    authSession.setActiveOrgId('org-1')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'invalid refresh token' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await customFetch<{ status: number }>('/api/v1/things', {})

    expect(result.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authSession.getAccessToken()).toBeNull()
    expect(authSession.getActiveOrgId()).toBeNull()
  })
})
