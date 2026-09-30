import { describe, expect, it } from 'vitest'
import { refreshAccessToken } from './refresh-queue'

describe('refreshAccessToken', () => {
  it('dedupes concurrent calls into a single underlying refresh', async () => {
    let calls = 0
    let resolveRefresh!: (value: boolean) => void
    const refresh = () =>
      new Promise<boolean>((resolve) => {
        calls += 1
        resolveRefresh = resolve
      })

    const first = refreshAccessToken(refresh)
    const second = refreshAccessToken(refresh)

    resolveRefresh(true)

    const [a, b] = await Promise.all([first, second])

    expect(calls).toBe(1)
    expect(a).toBe(true)
    expect(b).toBe(true)
  })

  it('allows a new refresh after the previous one settles', async () => {
    let calls = 0
    const refresh = () => {
      calls += 1
      return Promise.resolve(calls > 1)
    }

    const first = await refreshAccessToken(refresh)
    const second = await refreshAccessToken(refresh)

    expect(first).toBe(false)
    expect(second).toBe(true)
    expect(calls).toBe(2)
  })
})
