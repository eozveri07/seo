import { describe, expect, it } from 'vitest'
import { matchesPositionRange, matchesTrend, summarizeRankHistory, type RankHistoryPoint } from './rank-calc'

function point(date: string, position: number | null, url: string | null = null): RankHistoryPoint {
  return { date, position, url }
}

describe('summarizeRankHistory', () => {
  it('bugünün pozisyonunu ve URL’sini döner', () => {
    const summary = summarizeRankHistory('2026-09-30', [point('2026-09-30', 5, '/a')])
    expect(summary.position).toBe(5)
    expect(summary.url).toBe('/a')
  })

  it('bugün veri yoksa pozisyon null döner', () => {
    const summary = summarizeRankHistory('2026-09-30', [point('2026-09-29', 5)])
    expect(summary.position).toBeNull()
  })

  it('change1d/7d/30d iki uçtan biri eksikse null döner, ikisi de varsa farkı döner', () => {
    const summary = summarizeRankHistory('2026-09-30', [
      point('2026-09-30', 5),
      point('2026-09-29', 8),
      point('2026-09-23', 10),
    ])
    expect(summary.change1d).toBe(5 - 8)
    expect(summary.change7d).toBe(5 - 10)
    expect(summary.change30d).toBeNull()
  })

  it('bestPosition pencere içindeki en küçük pozisyondur', () => {
    const summary = summarizeRankHistory('2026-09-30', [
      point('2026-09-30', 12),
      point('2026-09-20', 3),
      point('2026-08-01', 1), // pencere dışı (30 günden eski), sayılmaz
    ])
    expect(summary.bestPosition).toBe(3)
  })

  it('sparkline pencereyi eskiden yeniye sıralı döner', () => {
    const summary = summarizeRankHistory('2026-09-30', [point('2026-09-29', 4), point('2026-09-30', 2)])
    expect(summary.sparkline).toEqual([4, 2])
  })

  it('lastCheckedDate en son veri noktasının tarihidir', () => {
    const summary = summarizeRankHistory('2026-09-30', [point('2026-09-25', null), point('2026-09-28', 6)])
    expect(summary.lastCheckedDate).toBe('2026-09-28')
  })

  it('hiç veri yoksa her şey null döner', () => {
    const summary = summarizeRankHistory('2026-09-30', [])
    expect(summary).toEqual({
      position: null,
      url: null,
      change1d: null,
      change7d: null,
      change30d: null,
      bestPosition: null,
      sparkline: [],
      lastCheckedDate: null,
    })
  })
})

describe('matchesPositionRange', () => {
  it('top3/top10/top20 sınırları içeriyor', () => {
    expect(matchesPositionRange(3, 'top3')).toBe(true)
    expect(matchesPositionRange(4, 'top3')).toBe(false)
    expect(matchesPositionRange(10, 'top10')).toBe(true)
    expect(matchesPositionRange(20, 'top20')).toBe(true)
  })

  it('outside 20 üstü ya da hiç bulunamayan (null) pozisyonları kapsar', () => {
    expect(matchesPositionRange(21, 'outside')).toBe(true)
    expect(matchesPositionRange(null, 'outside')).toBe(true)
    expect(matchesPositionRange(null, 'top3')).toBe(false)
  })

  it('all her zaman true döner', () => {
    expect(matchesPositionRange(null, 'all')).toBe(true)
  })
})

describe('matchesTrend', () => {
  it('rising negatif change7d, falling pozitif change7d ister', () => {
    expect(matchesTrend(-2, 'rising')).toBe(true)
    expect(matchesTrend(2, 'rising')).toBe(false)
    expect(matchesTrend(2, 'falling')).toBe(true)
    expect(matchesTrend(-2, 'falling')).toBe(false)
  })

  it('change7d null ise rising/falling eşleşmez, all her zaman eşleşir', () => {
    expect(matchesTrend(null, 'rising')).toBe(false)
    expect(matchesTrend(null, 'falling')).toBe(false)
    expect(matchesTrend(null, 'all')).toBe(true)
  })
})
