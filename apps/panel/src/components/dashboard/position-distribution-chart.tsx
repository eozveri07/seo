import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { ProjectDailySummaryPointDto } from '@/api/endpoints.schemas'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const chartConfig = {
  count: { label: 'Keyword sayısı', color: 'var(--chart-4)' },
} satisfies ChartConfig

export function PositionDistributionChart({ latest }: { latest: ProjectDailySummaryPointDto | null }) {
  if (!latest) return null

  const top3 = latest.kwTop3
  const top10to3 = Math.max(0, latest.kwTop10 - latest.kwTop3)
  const top20to10 = Math.max(0, latest.kwTop20 - latest.kwTop10)
  const top100to20 = Math.max(0, latest.kwTop100 - latest.kwTop20)
  const outside = Math.max(0, latest.kwTracked - latest.kwTop100)

  const data = [
    { bucket: 'Top 3', count: top3 },
    { bucket: '4–10', count: top10to3 },
    { bucket: '11–20', count: top20to10 },
    { bucket: '21–100', count: top100to20 },
    { bucket: '100+', count: outside },
  ]

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
