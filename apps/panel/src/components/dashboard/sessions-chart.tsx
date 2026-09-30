import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import type { ProjectDailySummaryPointDto } from '@/api/endpoints.schemas'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const chartConfig = {
  organicSessions: { label: 'Organik oturum', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function SessionsChart({ points }: { points: ProjectDailySummaryPointDto[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={points} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => format(new Date(value), 'd MMM')}
        />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => format(new Date(String(value)), 'd MMM yyyy')} />} />
        <Area
          dataKey="organicSessions"
          type="monotone"
          stroke="var(--color-organicSessions)"
          fill="var(--color-organicSessions)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
