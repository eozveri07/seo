import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { RankHistoryPointDto } from '@/api/endpoints.schemas'

const chartConfig = {
  position: { label: 'Pozisyon', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Ters eksen: 1 (en iyi) grafikte üstte görünür. */
export function PositionHistoryChart({ points }: { points: RankHistoryPointDto[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
      <LineChart data={points} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => format(new Date(value), 'd MMM')} />
        <YAxis reversed domain={[1, 'dataMax']} allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => format(new Date(String(value)), 'd MMM yyyy')}
              formatter={(value) => (value === null ? 'Bulunamadı (20+)' : String(value))}
            />
          }
        />
        <Line dataKey="position" type="monotone" stroke="var(--color-position)" strokeWidth={2} connectNulls={false} dot={{ r: 2 }} />
      </LineChart>
    </ChartContainer>
  )
}
