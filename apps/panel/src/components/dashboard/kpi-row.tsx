import type { ProjectDailySummaryPointDto } from '@/api/endpoints.schemas'
import { Card, CardContent } from '@/components/ui/card'
import { TrendBadge } from './trend-badge'

function sum(points: ProjectDailySummaryPointDto[], key: keyof ProjectDailySummaryPointDto): number {
  return points.reduce((total, point) => total + (Number(point[key]) || 0), 0)
}

function average(points: ProjectDailySummaryPointDto[], key: keyof ProjectDailySummaryPointDto): number | null {
  const values = points.map((point) => point[key]).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((total, v) => total + v, 0) / values.length
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return (current - previous) / previous
}

function formatNumber(value: number | null, fractionDigits = 0): string {
  if (value === null) return '—'
  return value.toLocaleString('tr-TR', { maximumFractionDigits: fractionDigits })
}

export function KpiRow({
  current,
  previous,
}: {
  current: ProjectDailySummaryPointDto[]
  previous: ProjectDailySummaryPointDto[] | null
}) {
  const clicks = sum(current, 'gscClicks')
  const impressions = sum(current, 'gscImpressions')
  const sessions = sum(current, 'organicSessions')
  const avgPosition = average(current, 'kwAvgPosition')

  const prevClicks = previous ? sum(previous, 'gscClicks') : null
  const prevImpressions = previous ? sum(previous, 'gscImpressions') : null
  const prevSessions = previous ? sum(previous, 'organicSessions') : null
  const prevAvgPosition = previous ? average(previous, 'kwAvgPosition') : null

  const items = [
    { label: 'Tıklama', value: formatNumber(clicks), change: pctChange(clicks, prevClicks), invert: false },
    { label: 'Gösterim', value: formatNumber(impressions), change: pctChange(impressions, prevImpressions), invert: false },
    { label: 'Organik oturum', value: formatNumber(sessions), change: pctChange(sessions, prevSessions), invert: false },
    {
      label: 'Ortalama pozisyon',
      value: formatNumber(avgPosition, 1),
      change: pctChange(avgPosition, prevAvgPosition),
      invert: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex flex-col gap-1 pt-6">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
            {previous && (
              <div className="flex items-center gap-1">
                <TrendBadge value={item.change} invert={item.invert} />
                <span className="text-[10px] text-muted-foreground">önceki döneme göre</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
