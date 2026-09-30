import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useGscControllerPages, useGscControllerQueries } from '@/api/gsc/gsc'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { GscSortField, type GscPageRowDto, type GscQueryRowDto } from '@/api/endpoints.schemas'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ProjectNav } from '@/components/projects/project-nav'
import { ExplorerTable } from '@/components/explorer/explorer-table'
import { ExplorerDetailSheet } from '@/components/explorer/detail-sheet'
import { pageRowToExplorerRow, queryRowToExplorerRow, type ExplorerRow } from '@/components/explorer/types'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { defaultDateRange, isValidIsoDate, previousPeriod } from '@/lib/date-range'

const PAGE_SIZE = 20

type ExplorerSearch = {
  tab: 'queries' | 'pages'
  from: string
  to: string
  search: string
  sort: GscSortField
  order: 'asc' | 'desc'
  page: number
  compare: boolean
  detail: string | undefined
  detailLabel: string | undefined
}

export const Route = createFileRoute('/_app/projects/$projectId_/explorer')({
  validateSearch: (search: Record<string, unknown>): ExplorerSearch => {
    const fallback = defaultDateRange()
    return {
      tab: search.tab === 'pages' ? 'pages' : 'queries',
      from: isValidIsoDate(search.from) ? search.from : fallback.from,
      to: isValidIsoDate(search.to) ? search.to : fallback.to,
      search: typeof search.search === 'string' ? search.search : '',
      sort: Object.values(GscSortField).includes(search.sort as GscSortField) ? (search.sort as GscSortField) : GscSortField.clicks,
      order: search.order === 'asc' ? 'asc' : 'desc',
      page: typeof search.page === 'number' && search.page > 0 ? search.page : 1,
      compare: search.compare === true,
      detail: typeof search.detail === 'string' ? search.detail : undefined,
      detailLabel: typeof search.detailLabel === 'string' ? search.detailLabel : undefined,
    }
  },
  component: GscExplorerPage,
})

function GscExplorerPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { tab, from, to, sort, order, page, compare, detail, detailLabel } = search

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  const [searchInput, setSearchInput] = useState(search.search)
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  useEffect(() => {
    if (debouncedSearch !== search.search) {
      void navigate({ search: { ...search, search: debouncedSearch, page: 1 } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const commonParams = { from, to, sort, order, search: search.search || undefined, page, limit: PAGE_SIZE }

  const queriesQuery = useGscControllerQueries(projectId, commonParams, { query: { enabled: tab === 'queries' } })
  const pagesQuery = useGscControllerPages(projectId, commonParams, { query: { enabled: tab === 'pages' } })
  const activeQuery = tab === 'queries' ? queriesQuery : pagesQuery

  const prevRange = previousPeriod({ from, to })
  const prevParams = { from: prevRange.from, to: prevRange.to, sort, order, search: search.search || undefined, page: 1, limit: 200 }
  const prevQueriesQuery = useGscControllerQueries(projectId, prevParams, { query: { enabled: compare && tab === 'queries' } })
  const prevPagesQuery = useGscControllerPages(projectId, prevParams, { query: { enabled: compare && tab === 'pages' } })
  const prevActiveQuery = tab === 'queries' ? prevQueriesQuery : prevPagesQuery

  const rows: ExplorerRow[] = useMemo(() => {
    if (activeQuery.data?.status !== 200) return []
    return tab === 'queries'
      ? (activeQuery.data.data.items as GscQueryRowDto[]).map(queryRowToExplorerRow)
      : (activeQuery.data.data.items as GscPageRowDto[]).map(pageRowToExplorerRow)
  }, [activeQuery.data, tab])

  const previousByKey = useMemo(() => {
    if (!compare || prevActiveQuery.data?.status !== 200) return null
    const items = tab === 'queries'
      ? (prevActiveQuery.data.data.items as GscQueryRowDto[]).map(queryRowToExplorerRow)
      : (prevActiveQuery.data.data.items as GscPageRowDto[]).map(pageRowToExplorerRow)
    return new Map(items.map((row) => [row.key, row]))
  }, [compare, prevActiveQuery.data, tab])

  const total = activeQuery.data?.status === 200 ? activeQuery.data.data.total : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function updateSearch(patch: Partial<typeof search>) {
    void navigate({ search: { ...search, ...patch } })
  }

  function onSort(field: string) {
    const nextOrder = sort === field && order === 'desc' ? 'asc' : 'desc'
    updateSearch({ sort: field as GscSortField, order: nextOrder, page: 1 })
  }

  function onRowClick(row: ExplorerRow) {
    updateSearch({ detail: row.key, detailLabel: row.label })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{projectName ? `GSC Explorer — ${projectName}` : 'GSC Explorer'}</h1>
        <ProjectNav projectId={projectId} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(value) => updateSearch({ tab: value as 'queries' | 'pages', page: 1, detail: undefined })}>
          <TabsList>
            <TabsTrigger value="queries">Queries</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
          </TabsList>
        </Tabs>
        <DateRangePicker value={{ from, to }} onChange={(range) => updateSearch({ ...range, page: 1 })} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder={tab === 'queries' ? 'Sorgu ara…' : 'Sayfa ara…'}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Checkbox id="compare" checked={compare} onCheckedChange={(checked) => updateSearch({ compare: checked === true })} />
          <Label htmlFor="compare" className="text-sm font-normal">
            Önceki dönemle karşılaştır
          </Label>
        </div>
      </div>

      {activeQuery.isPending && <LoadingState rows={6} />}
      {!activeQuery.isPending && activeQuery.isError && <ErrorState onRetry={() => activeQuery.refetch()} />}
      {!activeQuery.isPending && !activeQuery.isError && rows.length === 0 && (
        <EmptyState
          title={search.search ? 'Sonuç bulunamadı' : 'Bu dönemde veri yok'}
          description={search.search ? 'Farklı bir arama terimi deneyin.' : 'Bağlantı eklenmemiş olabilir ya da senkronizasyon henüz tamamlanmadı.'}
        />
      )}
      {!activeQuery.isPending && !activeQuery.isError && rows.length > 0 && (
        <>
          <ExplorerTable
            rows={rows}
            previousByKey={previousByKey}
            sort={sort}
            order={order}
            onSort={onSort}
            onRowClick={onRowClick}
            labelHeader={tab === 'queries' ? 'Sorgu' : 'Sayfa'}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Sayfa {page} / {totalPages} — {total.toLocaleString('tr-TR')} sonuç
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

      <ExplorerDetailSheet
        projectId={projectId}
        tab={tab}
        detailKey={detail ?? null}
        detailLabel={detailLabel ?? null}
        from={from}
        to={to}
        onClose={() => updateSearch({ detail: undefined, detailLabel: undefined })}
      />
    </div>
  )
}
