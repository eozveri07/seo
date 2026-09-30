import { useGscControllerPageQueries, useGscControllerQueryPages } from '@/api/gsc/gsc'
import type { GscPageRowDto, GscQueryRowDto } from '@/api/endpoints.schemas'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState, ErrorState, EmptyState } from '@/components/common/state-views'
import { pageRowToExplorerRow, queryRowToExplorerRow } from './types'

export function ExplorerDetailSheet({
  projectId,
  tab,
  detailKey,
  detailLabel,
  from,
  to,
  onClose,
}: {
  projectId: string
  tab: 'queries' | 'pages'
  detailKey: string | null
  detailLabel: string | null
  from: string
  to: string
  onClose: () => void
}) {
  const queryPages = useGscControllerQueryPages(projectId, detailKey ?? '', { from, to, limit: 50 }, { query: { enabled: tab === 'queries' && !!detailKey } })
  const pageQueries = useGscControllerPageQueries(projectId, detailKey ?? '', { from, to, limit: 50 }, { query: { enabled: tab === 'pages' && !!detailKey } })

  const active = tab === 'queries' ? queryPages : pageQueries
  const rows =
    active.data?.status === 200
      ? tab === 'queries'
        ? (active.data.data.items as GscPageRowDto[]).map(pageRowToExplorerRow)
        : (active.data.data.items as GscQueryRowDto[]).map(queryRowToExplorerRow)
      : []

  return (
    <Sheet open={!!detailKey} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="break-all">{detailLabel}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {active.isPending && <LoadingState rows={3} />}
          {!active.isPending && active.isError && <ErrorState onRetry={() => active.refetch()} />}
          {!active.isPending && !active.isError && rows.length === 0 && (
            <EmptyState title="Bu dönemde veri yok" />
          )}
          {!active.isPending && !active.isError && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tab === 'queries' ? 'Sayfa' : 'Sorgu'}</TableHead>
                  <TableHead className="text-right">Tıklama</TableHead>
                  <TableHead className="text-right">Pozisyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="max-w-xs truncate" title={row.label}>
                      {row.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.clicks.toLocaleString('tr-TR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.position.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
