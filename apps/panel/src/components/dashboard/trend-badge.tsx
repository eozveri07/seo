import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bazı metriklerde (pozisyon) düşüş iyidir; `invert` ile yön/renk ilişkisi tersine çevrilir.
 */
export function TrendBadge({
  value,
  invert = false,
  className,
}: {
  value: number | null | undefined
  invert?: boolean
  className?: string
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  }

  const isFlat = Math.abs(value) < 0.001
  const isPositive = value > 0
  const isGood = isFlat ? null : invert ? !isPositive : isPositive

  const colorClass = isFlat ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive'
  const Icon = isFlat ? MinusIcon : isPositive ? TrendingUpIcon : TrendingDownIcon

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', colorClass, className)}>
      <Icon className="size-3" />
      {isPositive && !isFlat ? '+' : ''}
      {(value * 100).toFixed(1)}%
    </span>
  )
}
