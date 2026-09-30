import { toast } from 'sonner'
import { useConnectionControllerVerify } from '@/api/connections/connections'
import { ConnectionStatus, type ConnectionResponseDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BackfillProgress } from './backfill-progress'

const statusLabels: Record<string, string> = {
  pending: 'Beklemede',
  active: 'Aktif',
  error: 'Hata',
  revoked: 'İptal edildi',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  active: 'default',
  error: 'destructive',
  revoked: 'destructive',
}

export function ConnectionStatusPanel({ connection }: { connection: ConnectionResponseDto }) {
  const { mutateAsync: verify, isPending } = useConnectionControllerVerify()

  async function onVerify() {
    const response = await verify({ connectionId: connection.id })
    if (response.status !== 200) {
      toast.error('Doğrulama yapılamadı.')
      return
    }
    if (response.data.status === ConnectionStatus.error) {
      toast.error(response.data.lastError ?? 'Bağlantı doğrulanamadı.')
    } else {
      toast.success('Bağlantı doğrulandı.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[connection.status]}>{statusLabels[connection.status] ?? connection.status}</Badge>
          <span className="text-sm text-muted-foreground">{connection.externalId}</span>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => void onVerify()}>
          Doğrula
        </Button>
      </div>
      {connection.status === ConnectionStatus.error && connection.lastError && (
        <p className="text-sm text-destructive">{connection.lastError}</p>
      )}
      <BackfillProgress connection={connection} />
    </div>
  )
}
