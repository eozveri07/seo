import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import type { ProjectDailySummaryPointDto } from '@/api/endpoints.schemas'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const chartConfig = {
  gscClicks: { label: 'Tıklama', color: 'var(--chart-1)' },
  gscImpressions: { label: 'Gösterim', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function GscTrendChart({ points }: { points: ProjectDailySummaryPointDto[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <LineChart data={points} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => format(new Date(value), 'd MMM')}
        />
        <YAxis yAxisId="clicks" tickLine={false} axisLine={false} width={40} />
        <YAxis yAxisId="impressions" orientation="right" tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => format(new Date(String(value)), 'd MMM yyyy')} />} />
        <Line
          yAxisId="clicks"
          dataKey="gscClicks"
          type="monotone"
          stroke="var(--color-gscClicks)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="impressions"
          dataKey="gscImpressions"
          type="monotone"
          stroke="var(--color-gscImpressions)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
