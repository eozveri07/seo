import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useKeywordGroupsControllerList } from '@/api/keywords/keywords'
import { useTrackedKeywordsControllerList } from '@/api/keywords/keywords'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { Button } from '@/components/ui/button'
import { ProjectNav } from '@/components/projects/project-nav'
import { KeywordFilters } from '@/components/keywords/keyword-filters'
import { KeywordTable } from '@/components/keywords/keyword-table'
import { BulkAddDialog } from '@/components/keywords/bulk-add-dialog'
import { SuggestionsDialog } from '@/components/keywords/suggestions-dialog'
import { GroupManageDialog } from '@/components/keywords/group-manage-dialog'
import { KeywordDetailSheet } from '@/components/keywords/keyword-detail-sheet'
import { useKeywordRankSummaries } from '@/hooks/use-keyword-rank-summaries'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { matchesPositionRange, matchesTrend, type PositionRangeFilter, type TrendFilter } from '@/lib/rank-calc'
import { usePermissions } from '@/lib/auth/use-permissions'

const PAGE_SIZE = 20
const LIST_LIMIT = 200
const POSITION_RANGES: PositionRangeFilter[] = ['all', 'top3', 'top10', 'top20', 'outside']
const TRENDS: TrendFilter[] = ['all', 'rising', 'falling']

type KeywordsSearch = {
  search: string
  groupId: string | undefined
  tag: string
  positionRange: PositionRangeFilter
  trend: TrendFilter
  page: number
  detail: string | undefined
}

export const Route = createFileRoute('/_app/projects/$projectId_/keywords')({
  validateSearch: (search: Record<string, unknown>): KeywordsSearch => ({
    search: typeof search.search === 'string' ? search.search : '',
    groupId: typeof search.groupId === 'string' ? search.groupId : undefined,
    tag: typeof search.tag === 'string' ? search.tag : '',
    positionRange: POSITION_RANGES.includes(search.positionRange as PositionRangeFilter) ? (search.positionRange as PositionRangeFilter) : 'all',
    trend: TRENDS.includes(search.trend as TrendFilter) ? (search.trend as TrendFilter) : 'all',
    page: typeof search.page === 'number' && search.page > 0 ? search.page : 1,
    detail: typeof search.detail === 'string' ? search.detail : undefined,
  }),
  component: ProjectKeywordsPage,
})

function ProjectKeywordsPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const permissions = usePermissions()

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  const [searchInput, setSearchInput] = useState(search.search)
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [tagInput, setTagInput] = useState(search.tag)
  const debouncedTag = useDebouncedValue(tagInput, 300)

  useEffect(() => {
    if (debouncedSearch !== search.search || debouncedTag !== search.tag) {
      void navigate({ search: { ...search, search: debouncedSearch, tag: debouncedTag, page: 1 } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedTag])

  const groupsQuery = useKeywordGroupsControllerList(projectId, { page: 1, limit: 200 })
  const groups = useMemo(() => (groupsQuery.data?.status === 200 ? groupsQuery.data.data.items : []), [groupsQuery.data])
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])

  const keywordsQuery = useTrackedKeywordsControllerList(projectId, {
    page: 1,
    limit: LIST_LIMIT,
    search: search.search || undefined,
    groupId: search.groupId,
    tag: search.tag || undefined,
  })
  const allKeywords = useMemo(() => (keywordsQuery.data?.status === 200 ? keywordsQuery.data.data.items : []), [keywordsQuery.data])
  const keywordIds = useMemo(() => allKeywords.map((keyword) => keyword.id), [allKeywords])

  const { summaries, isPending: summariesPending } = useKeywordRankSummaries(projectId, keywordIds)

  const filteredKeywords = useMemo(
    () =>
      allKeywords.filter((keyword) => {
        const summary = summaries.get(keyword.id)
        return (
          matchesPositionRange(summary?.position ?? null, search.positionRange) &&
          matchesTrend(summary?.change7d ?? null, search.trend)
        )
      }),
    [allKeywords, summaries, search.positionRange, search.trend],
  )

  const totalPages = Math.max(1, Math.ceil(filteredKeywords.length / PAGE_SIZE))
  const page = Math.min(search.page, totalPages)
  const pageKeywords = filteredKeywords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const detailKeyword = search.detail ? (allKeywords.find((keyword) => keyword.id === search.detail) ?? null) : null

  function updateSearch(patch: Partial<KeywordsSearch>) {
    void navigate({ search: { ...search, ...patch } })
  }

  const isPending = keywordsQuery.isPending || groupsQuery.isPending
  const isError = keywordsQuery.isError || groupsQuery.isError

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{projectName ? `Keyword'ler — ${projectName}` : "Keyword'ler"}</h1>
        <ProjectNav projectId={projectId} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <KeywordFilters
          search={searchInput}
          onSearchChange={setSearchInput}
          groups={groups}
          groupId={search.groupId}
          onGroupChange={(value) => updateSearch({ groupId: value, page: 1 })}
          tag={tagInput}
          onTagChange={setTagInput}
          positionRange={search.positionRange}
          onPositionRangeChange={(value) => updateSearch({ positionRange: value, page: 1 })}
          trend={search.trend}
          onTrendChange={(value) => updateSearch({ trend: value, page: 1 })}
        />
        {permissions.canManageKeywords && (
          <div className="flex flex-wrap gap-2">
            <GroupManageDialog projectId={projectId} groups={groups} canManage onChanged={() => void groupsQuery.refetch()} />
            <SuggestionsDialog projectId={projectId} onAdded={() => void keywordsQuery.refetch()} />
            <BulkAddDialog projectId={projectId} onAdded={() => void keywordsQuery.refetch()} />
          </div>
        )}
      </div>

      {isPending && <LoadingState rows={6} />}
      {!isPending && isError && <ErrorState onRetry={() => keywordsQuery.refetch()} />}
      {!isPending && !isError && allKeywords.length === 0 && (
        <EmptyState
          title="Henüz keyword yok"
          description="Toplu ekleme ile ya da GSC önerilerinden keyword takibe alın."
        />
      )}
      {!isPending && !isError && allKeywords.length > 0 && filteredKeywords.length === 0 && (
        <EmptyState title="Filtrelere uyan keyword yok" description="Filtreleri değiştirmeyi deneyin." />
      )}
      {!isPending && !isError && pageKeywords.length > 0 && (
        <>
          <KeywordTable
            rows={pageKeywords}
            groupsById={groupsById}
            summaries={summaries}
            onRowClick={(keyword) => updateSearch({ detail: keyword.id })}
          />
          {summariesPending && <p className="text-xs text-muted-foreground">Pozisyon verileri yükleniyor…</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Sayfa {page} / {totalPages} — {filteredKeywords.length.toLocaleString('tr-TR')} keyword
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateSearch({ page: page - 1 })}>
                Önceki
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => updateSearch({ page: page + 1 })}>
                Sonraki
              </Button>
            </div>
          </div>
        </>
      )}

      <KeywordDetailSheet
        projectId={projectId}
        keyword={detailKeyword}
        canManage={permissions.canManageKeywords}
        onClose={() => updateSearch({ detail: undefined })}
      />
    </div>
  )
}
