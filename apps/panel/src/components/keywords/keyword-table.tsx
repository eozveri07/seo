import { LaptopIcon, SmartphoneIcon } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { KeywordGroupResponseDto, TrackedKeywordResponseDto } from '@/api/endpoints.schemas'
import type { KeywordRankSummary } from '@/lib/rank-calc'
import { Sparkline } from './sparkline'

function PositionCell({ position }: { position: number | null }) {
  if (position === null) return <span className="text-sm text-muted-foreground">20+</span>
  return <span className="text-sm font-medium tabular-nums">{position}</span>
}

function ChangeCell({ change }: { change: number | null }) {
  // TrendBadge % formatlıyor; pozisyon değişimini -5..+5 gibi tam sayı göstermek için kendi rozetimiz.
  if (change === null) return <span className="text-xs text-muted-foreground">—</span>
  const isFlat = change === 0
  const isGood = change < 0
  return (
    <span className={`text-xs font-medium tabular-nums ${isFlat ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive'}`}>
      {change > 0 ? '+' : ''}
      {change}
    </span>
  )
}

export function KeywordTable({
  rows,
  groupsById,
  summaries,
  onRowClick,
}: {
  rows: TrackedKeywordResponseDto[]
  groupsById: Map<string, KeywordGroupResponseDto>
  summaries: Map<string, KeywordRankSummary>
  onRowClick: (keyword: TrackedKeywordResponseDto) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Keyword</TableHead>
          <TableHead>Grup</TableHead>
          <TableHead>Cihaz</TableHead>
          <TableHead className="text-right">Pozisyon</TableHead>
          <TableHead className="text-right">1g</TableHead>
          <TableHead className="text-right">7g</TableHead>
          <TableHead className="text-right">30g</TableHead>
          <TableHead className="text-right">En iyi</TableHead>
          <TableHead>URL</TableHead>
          <TableHead className="text-right">Hacim</TableHead>
          <TableHead>Son 30 gün</TableHead>
          <TableHead>Son kontrol</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((keyword) => {
          const group = keyword.groupId ? groupsById.get(keyword.groupId) : undefined
          const summary = summaries.get(keyword.id)
          return (
            <TableRow key={keyword.id} onClick={() => onRowClick(keyword)} className="cursor-pointer">
              <TableCell className="max-w-[220px] truncate font-medium" title={keyword.keyword}>
                {keyword.keyword}
              </TableCell>
              <TableCell>
                {group ? (
                  <Badge variant="outline" style={group.color ? { borderColor: group.color, color: group.color } : undefined}>
                    {group.name}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Grupsuz</span>
                )}
              </TableCell>
              <TableCell>
                {keyword.device === 'mobile' ? (
                  <SmartphoneIcon className="size-4 text-muted-foreground" aria-label="Mobil" />
                ) : (
                  <LaptopIcon className="size-4 text-muted-foreground" aria-label="Masaüstü" />
                )}
              </TableCell>
              <TableCell className="text-right">
                <PositionCell position={summary?.position ?? null} />
              </TableCell>
              <TableCell className="text-right">
                <ChangeCell change={summary?.change1d ?? null} />
              </TableCell>
              <TableCell className="text-right">
                <ChangeCell change={summary?.change7d ?? null} />
              </TableCell>
              <TableCell className="text-right">
                <ChangeCell change={summary?.change30d ?? null} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{summary?.bestPosition ?? '—'}</TableCell>
              <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={summary?.url ?? keyword.targetUrl ?? undefined}>
                {summary?.url ?? keyword.targetUrl ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{keyword.searchVolume?.toLocaleString('tr-TR') ?? '—'}</TableCell>
              <TableCell>
                <Sparkline points={summary?.sparkline ?? []} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {summary?.lastCheckedDate ? format(new Date(summary.lastCheckedDate), 'd MMM') : 'Hiç'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
