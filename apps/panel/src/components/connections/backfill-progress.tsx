import type { ConnectionResponseDto } from '@/api/endpoints.schemas'
import { ConnectionBackfillStatus } from '@/api/endpoints.schemas'
import { Progress } from '@/components/ui/progress'

const statusLabels: Record<string, string> = {
  pending: 'Sırada',
  running: 'Geçmiş veri çekiliyor…',
  done: 'Tamamlandı',
  failed: 'Başarısız',
}

export function BackfillProgress({ connection }: { connection: ConnectionResponseDto }) {
  if (connection.backfillStatus === ConnectionBackfillStatus.done) {
    return null
  }

  const progress = connection.backfillProgress as { done?: number; total?: number }
  const done = typeof progress.done === 'number' ? progress.done : 0
  const total = typeof progress.total === 'number' && progress.total > 0 ? progress.total : undefined
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : connection.backfillStatus === 'pending' ? 0 : undefined

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span>{statusLabels[connection.backfillStatus] ?? connection.backfillStatus}</span>
        {total !== undefined && (
          <span className="text-muted-foreground">
            {done}/{total} gün
          </span>
        )}
      </div>
      <Progress value={percent} className={connection.backfillStatus === 'failed' ? '[&>div]:bg-destructive' : undefined} />
    </div>
  )
}
