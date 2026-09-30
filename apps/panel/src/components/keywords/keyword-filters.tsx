import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { KeywordGroupResponseDto } from '@/api/endpoints.schemas'
import type { PositionRangeFilter, TrendFilter } from '@/lib/rank-calc'

const positionRangeLabels: Record<PositionRangeFilter, string> = {
  all: 'Tüm pozisyonlar',
  top3: 'İlk 3',
  top10: 'İlk 10',
  top20: 'İlk 20',
  outside: 'Dışarıda',
}

const trendLabels: Record<TrendFilter, string> = {
  all: 'Tümü',
  rising: 'Yükselen',
  falling: 'Düşen',
}

export function KeywordFilters({
  search,
  onSearchChange,
  groups,
  groupId,
  onGroupChange,
  tag,
  onTagChange,
  positionRange,
  onPositionRangeChange,
  trend,
  onTrendChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  groups: KeywordGroupResponseDto[]
  groupId: string | undefined
  onGroupChange: (value: string | undefined) => void
  tag: string
  onTagChange: (value: string) => void
  positionRange: PositionRangeFilter
  onPositionRangeChange: (value: PositionRangeFilter) => void
  trend: TrendFilter
  onTrendChange: (value: TrendFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Keyword ara…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="max-w-[220px]"
      />
      <Input
        placeholder="Etiket…"
        value={tag}
        onChange={(event) => onTagChange(event.target.value)}
        className="max-w-[160px]"
      />
      <Select value={groupId ?? 'all'} onValueChange={(value) => onGroupChange(value === 'all' ? undefined : value)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Grup" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tüm gruplar</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={positionRange} onValueChange={(value) => onPositionRangeChange(value as PositionRangeFilter)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(positionRangeLabels) as PositionRangeFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {positionRangeLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={trend} onValueChange={(value) => onTrendChange(value as TrendFilter)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(trendLabels) as TrendFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {trendLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
