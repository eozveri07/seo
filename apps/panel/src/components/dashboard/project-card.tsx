import { Link } from '@tanstack/react-router'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import type { ProjectSummaryCardDto } from '@/api/endpoints.schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendBadge } from './trend-badge'

function formatNumber(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
}

function MetricCell({
  label,
  value,
  change7d,
  change28d,
  invert,
}: {
  label: string
  value: number | null
  change7d: number | null
  change28d: number | null
  invert?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{formatNumber(value)}</span>
      <div className="flex items-center gap-2">
        <TrendBadge value={change7d} invert={invert} />
        <span className="text-[10px] text-muted-foreground">7g</span>
        <TrendBadge value={change28d} invert={invert} />
        <span className="text-[10px] text-muted-foreground">28g</span>
      </div>
    </div>
  )
}

export function ProjectCard({ card }: { card: ProjectSummaryCardDto }) {
  const sparkData = card.visibilitySeries.map((v, index) => ({ index, value: v }))

  return (
    <Link
      to="/projects/$projectId/dashboard"
      params={{ projectId: card.projectId }}
      search={{ from: undefined, to: undefined }}
    >
      <Card className="h-full transition-colors hover:border-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{card.projectName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {card.date === null ? (
            <p className="text-sm text-muted-foreground">Henüz özet verisi yok.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <MetricCell label="Tıklama" value={card.clicks.value} change7d={card.clicks.change7d} change28d={card.clicks.change28d} />
                <MetricCell
                  label="Organik oturum"
                  value={card.organicSessions.value}
                  change7d={card.organicSessions.change7d}
                  change28d={card.organicSessions.change28d}
                />
                <MetricCell
                  label="Ort. pozisyon"
                  value={card.avgPosition.value}
                  change7d={card.avgPosition.change7d}
                  change28d={card.avgPosition.change28d}
                  invert
                />
                <MetricCell
                  label="Visibility"
                  value={card.visibilityScore.value}
                  change7d={card.visibilityScore.change7d}
                  change28d={card.visibilityScore.change28d}
                />
              </div>
              {sparkData.length > 1 && (
                <div className="h-10 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`spark-${card.projectId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-primary)"
                        strokeWidth={1.5}
                        fill={`url(#spark-${card.projectId})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
