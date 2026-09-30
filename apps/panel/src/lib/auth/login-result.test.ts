import { describe, expect, it } from 'vitest'
import { resolveLoginOutcome } from './login-result'

const user = { id: 'u1', email: 'test@example.com', name: 'Test' } as never

describe('resolveLoginOutcome', () => {
  it('returns success only on 200', () => {
    const outcome = resolveLoginOutcome({
      status: 200,
      data: { tokenType: 'Bearer', accessToken: 'token-abc', expiresIn: 3600, user },
      headers: new Headers(),
    } as never)

    expect(outcome).toEqual({ type: 'success', accessToken: 'token-abc', user })
  })

  it('shows a generic error and does not open a session on 500', () => {
    const outcome = resolveLoginOutcome({ status: 500, data: undefined, headers: new Headers() } as never)

    expect(outcome).toEqual({ type: 'error', message: 'Giriş yapılamadı, tekrar deneyin.' })
  })

  it('shows a generic error and does not open a session on 502', () => {
    const outcome = resolveLoginOutcome({ status: 502, data: undefined, headers: new Headers() } as never)

    expect(outcome).toEqual({ type: 'error', message: 'Giriş yapılamadı, tekrar deneyin.' })
  })

  it('keeps the specific message for 401', () => {
    const outcome = resolveLoginOutcome({ status: 401, data: undefined, headers: new Headers() } as never)

    expect(outcome).toEqual({ type: 'error', message: 'E-posta veya şifre hatalı.' })
  })

  it('keeps the specific message for 429', () => {
    const outcome = resolveLoginOutcome({ status: 429, data: undefined, headers: new Headers() } as never)

    expect(outcome).toEqual({ type: 'error', message: 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.' })
  })

  it('shows a network error when the request throws (resolved to null)', () => {
    const outcome = resolveLoginOutcome(null)

    expect(outcome).toEqual({ type: 'error', message: 'Sunucuya ulaşılamadı. Tekrar deneyin.' })
  })
})
