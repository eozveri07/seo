import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHeader } from './sortable-header'
import { TrendBadge } from '@/components/dashboard/trend-badge'
import type { ExplorerRow } from './types'

function formatInt(value: number): string {
  return value.toLocaleString('tr-TR')
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatPosition(value: number): string {
  return value.toFixed(1)
}

export function ExplorerTable({
  rows,
  previousByKey,
  sort,
  order,
  onSort,
  onRowClick,
  labelHeader,
}: {
  rows: ExplorerRow[]
  previousByKey: Map<string, ExplorerRow> | null
  sort: string
  order: 'asc' | 'desc'
  onSort: (field: string) => void
  onRowClick: (row: ExplorerRow) => void
  labelHeader: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHeader}</TableHead>
          <TableHead className="text-right">
            <SortableHeader label="Tıklama" field="clicks" activeField={sort} order={order} onSort={onSort} align="right" />
          </TableHead>
          <TableHead className="text-right">
            <SortableHeader label="Gösterim" field="impressions" activeField={sort} order={order} onSort={onSort} align="right" />
          </TableHead>
          <TableHead className="text-right">
            <SortableHeader label="CTR" field="ctr" activeField={sort} order={order} onSort={onSort} align="right" />
          </TableHead>
          <TableHead className="text-right">
            <SortableHeader label="Pozisyon" field="position" activeField={sort} order={order} onSort={onSort} align="right" />
          </TableHead>
          {previousByKey && <TableHead className="text-right">Değişim (tıklama)</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const prev = previousByKey?.get(row.key)
          const change = prev && prev.clicks !== 0 ? (row.clicks - prev.clicks) / prev.clicks : prev ? null : undefined

          return (
            <TableRow key={row.key} onClick={() => onRowClick(row)} className="cursor-pointer">
              <TableCell className="max-w-xs truncate" title={row.label}>
                {row.label}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatInt(row.clicks)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatInt(row.impressions)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPct(row.ctr)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPosition(row.position)}</TableCell>
              {previousByKey && (
                <TableCell className="text-right">
                  {change === undefined ? (
                    <span className="text-xs text-muted-foreground">yeni</span>
                  ) : (
                    <TrendBadge value={change} />
                  )}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
