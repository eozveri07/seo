import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { subDays, format } from 'date-fns'
import { getRankingsControllerHistoryQueryOptions } from '@/api/rankings/rankings'
import { summarizeRankHistory, type KeywordRankSummary } from '@/lib/rank-calc'

/** Backend `MAX_HISTORY_KEYWORDS`; bir istekte en fazla bu kadar keyword id'si gönderilebilir. */
const HISTORY_BATCH_SIZE = 50

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

/**
 * Keyword tablosundaki pozisyon/değişim/sparkline kolonları; `rankings/history`
 * (son 30 gün) sonucundan istemcide hesaplanır (bkz. `rank-calc.ts`).
 */
export function useKeywordRankSummaries(projectId: string, keywordIds: string[]) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const from = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const batches = useMemo(() => chunk(keywordIds, HISTORY_BATCH_SIZE), [keywordIds])

  const queries = useQueries({
    queries: batches.map((batch) =>
      getRankingsControllerHistoryQueryOptions(projectId, { keywordIds: batch, from, to: today }, { query: { enabled: batch.length > 0 } }),
    ),
  })

  const isPending = keywordIds.length > 0 && queries.some((query) => query.isPending)
  const isError = queries.some((query) => query.isError || (query.data && query.data.status !== 200))

  const summaries = useMemo(() => {
    const map = new Map<string, KeywordRankSummary>()
    for (const query of queries) {
      if (query.data?.status !== 200) continue
      for (const keyword of query.data.data.keywords) {
        map.set(keyword.trackedKeywordId, summarizeRankHistory(today, keyword.points))
      }
    }
    return map
  }, [queries, today])

  return { summaries, isPending, isError }
}
