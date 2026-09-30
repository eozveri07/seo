import { addDays } from 'date-fns'

export interface RankHistoryPoint {
  /** YYYY-MM-DD. */
  date: string
  position: number | null
  url: string | null
}

export interface KeywordRankSummary {
  position: number | null
  url: string | null
  /** Pozitif: düşüş (kötü), negatif: yükseliş (iyi). */
  change1d: number | null
  change7d: number | null
  change30d: number | null
  /** Görüntülenen pencere içindeki (son 30 gün) en iyi pozisyon. */
  bestPosition: number | null
  /** Son 30 gün, eskiden yeniye; veri yoksa null. */
  sparkline: (number | null)[]
  /** Son veri noktasının tarihi (kontrol edilmiş son gün); hiç yoksa null. */
  lastCheckedDate: string | null
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * `keyword_rank_latest`'in (ARCHITECTURE §5.5) istemci tarafı benzeri: API
 * henüz keyword başına hazır bir özet döndürmediği için `rankings/history`
 * sonucundan aynı hesabı burada yapıyoruz. Tek fark: sunucudaki
 * `bestPosition` tüm zamanların en iyisini biriktirir, burada yalnızca
 * görüntülenen 30 günlük pencere biliniyor.
 */
export function summarizeRankHistory(today: string, points: RankHistoryPoint[]): KeywordRankSummary {
  const byDate = new Map(points.map((point) => [point.date, point]))
  const position = byDate.get(today)?.position ?? null
  const url = byDate.get(today)?.url ?? null

  const changeFromDaysAgo = (days: number): number | null => {
    const past = byDate.get(toIso(addDays(new Date(`${today}T00:00:00Z`), -days)))?.position ?? null
    return position !== null && past !== null ? position - past : null
  }

  const sparklineStart = toIso(addDays(new Date(`${today}T00:00:00Z`), -29))
  const sparklinePoints = points.filter((point) => point.date >= sparklineStart && point.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1))
  const windowPositions = sparklinePoints.map((point) => point.position).filter((value): value is number => value !== null)
  const bestPosition = windowPositions.length > 0 ? Math.min(...windowPositions) : null

  const checkedDates = points.map((point) => point.date).sort()
  const lastCheckedDate = checkedDates.length > 0 ? checkedDates[checkedDates.length - 1] : null

  return {
    position,
    url,
    change1d: changeFromDaysAgo(1),
    change7d: changeFromDaysAgo(7),
    change30d: changeFromDaysAgo(30),
    bestPosition,
    sparkline: sparklinePoints.map((point) => point.position),
    lastCheckedDate,
  }
}

export type PositionRangeFilter = 'all' | 'top3' | 'top10' | 'top20' | 'outside'

export function matchesPositionRange(position: number | null, range: PositionRangeFilter): boolean {
  if (range === 'all') return true
  if (position === null) return range === 'outside'
  switch (range) {
    case 'top3':
      return position <= 3
    case 'top10':
      return position <= 10
    case 'top20':
      return position <= 20
    case 'outside':
      return position > 20
  }
}

export type TrendFilter = 'all' | 'rising' | 'falling'

export function matchesTrend(change7d: number | null, trend: TrendFilter): boolean {
  if (trend === 'all') return true
  if (change7d === null) return false
  return trend === 'rising' ? change7d < 0 : change7d > 0
}
