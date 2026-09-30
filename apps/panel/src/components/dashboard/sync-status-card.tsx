import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { ConnectionResponseDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

const typeLabels: Record<string, string> = { gsc: 'Search Console', ga4: 'Analytics' }

function ConnectionRow({ connection }: { connection: ConnectionResponseDto }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{typeLabels[connection.type] ?? connection.type}</span>
        <span className="text-xs text-muted-foreground">
          {connection.lastSyncedAt
            ? `Son sync: ${format(new Date(connection.lastSyncedAt), 'd MMM yyyy HH:mm', { locale: tr })}`
            : 'Hiç senkronize edilmedi'}
        </span>
        {connection.status === 'error' && connection.lastError && (
          <span className="text-xs text-destructive">{connection.lastError}</span>
        )}
      </div>
      <Badge variant={statusVariant[connection.status]}>{statusLabels[connection.status] ?? connection.status}</Badge>
    </div>
  )
}

export function SyncStatusCard({ connections }: { connections: ConnectionResponseDto[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Senkronizasyon durumu</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz bağlantı eklenmedi.</p>
        ) : (
          connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} />)
        )}
      </CardContent>
    </Card>
  )
}
