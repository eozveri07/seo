const WIDTH = 72
const HEIGHT = 24
const PADDING = 2

/** Son 30 günün pozisyon eğrisi; küçük değer (iyi pozisyon) grafikte üstte görünür. */
export function Sparkline({ points }: { points: (number | null)[] }) {
  const present = points.filter((value): value is number => value !== null)
  if (present.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const min = Math.min(...present)
  const max = Math.max(...present)
  const range = max - min || 1
  const step = (WIDTH - PADDING * 2) / (points.length - 1)

  const segments: string[] = []
  let current: string[] = []
  points.forEach((value, index) => {
    const x = PADDING + index * step
    if (value === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    const y = PADDING + ((value - min) / range) * (HEIGHT - PADDING * 2)
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Son 30 günün pozisyon grafiği">
      {segments.map((segment, index) => (
        <polyline key={index} points={segment} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}
