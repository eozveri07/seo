import { CheckCircle2Icon, ClockIcon, XCircleIcon } from 'lucide-react'
import type { AlertEventResponseDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('tr-TR')
}

function EventDescription({ event }: { event: AlertEventResponseDto }) {
  const payload = event.payload as Record<string, unknown>
  switch (payload.alertType) {
    case 'rank_drop':
      return (
        <span>
          "{String(payload.keyword)}" pozisyonu {String(payload.previousPosition)} → {String(payload.position)}
        </span>
      )
    case 'rank_exit':
      return (
        <span>
          "{String(payload.keyword)}" top {String(payload.top)} dışında ({String(payload.days)} gündür)
        </span>
      )
    case 'traffic_drop':
      return (
        <span>
          {payload.metric === 'sessions' ? 'Oturum' : 'Tıklama'} %{Math.round(Number(payload.pctChange ?? 0))} düştü
        </span>
      )
    case 'sync_failure':
      return <span>{String(payload.reason ?? 'Senkronizasyon hatası')}</span>
    default:
      return <span>—</span>
  }
}

export function AlertEventTable({ events }: { events: AlertEventResponseDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarih</TableHead>
          <TableHead>Kural</TableHead>
          <TableHead>Açıklama</TableHead>
          <TableHead>Bildirim</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
              {formatDateTime(event.triggeredAt)}
            </TableCell>
            <TableCell>{event.ruleName ?? '—'}</TableCell>
            <TableCell>
              <EventDescription event={event} />
            </TableCell>
            <TableCell>
              {event.notifyError ? (
                <Badge variant="destructive" className="gap-1">
                  <XCircleIcon className="size-3.5" />
                  Hata
                </Badge>
              ) : event.notifiedAt ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2Icon className="size-3.5" />
                  Gönderildi
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <ClockIcon className="size-3.5" />
                  Bekliyor
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
