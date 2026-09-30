import { createFileRoute, Navigate } from '@tanstack/react-router'
import { MailIcon, PencilIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useNotificationChannelsControllerDelete, useNotificationChannelsControllerList } from '@/api/alerts/alerts'
import { NotificationChannelType } from '@/api/endpoints.schemas'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermissions } from '@/lib/auth/use-permissions'
import { ChannelDialog } from '@/components/alerts/channel-dialog'
import { ChannelTestButton } from '@/components/alerts/channel-test-button'

export const Route = createFileRoute('/_app/notifications/')({
  component: NotificationChannelsPage,
})

const TYPE_LABELS: Record<NotificationChannelType, string> = {
  [NotificationChannelType.email]: 'E-posta',
  [NotificationChannelType.discord]: 'Discord',
  [NotificationChannelType.slack]: 'Slack',
}

function NotificationChannelsPage() {
  const permissions = usePermissions()
  const { data, isPending, isError, refetch } = useNotificationChannelsControllerList()
  const { mutateAsync: deleteChannel } = useNotificationChannelsControllerDelete()

  if (!permissions.canManageNotificationChannels) return <Navigate to="/" search={{ clientId: undefined }} />

  const channels = data?.status === 200 ? data.data.items : []

  async function handleDelete(id: string) {
    const response = await deleteChannel({ channelId: id })
    if (response.status !== 204) {
      toast.error('Kanal silinemedi.')
      return
    }
    toast.success('Kanal silindi.')
    void refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bildirim kanalları</h1>
        <ChannelDialog onSaved={() => void refetch()} />
      </div>

      {isPending && <LoadingState rows={3} />}
      {!isPending && isError && <ErrorState onRetry={() => void refetch()} />}
      {!isPending && !isError && channels.length === 0 && (
        <EmptyState
          title="Henüz bir bildirim kanalı yok"
          description="E-posta, Discord ve Slack entegrasyonları için bir kanal ekleyin."
          action={<MailIcon className="size-5 text-muted-foreground" />}
        />
      )}
      {!isPending && !isError && channels.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Ayar</TableHead>
              <TableHead className="text-right">Aksiyonlar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABELS[channel.type]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {channel.type === NotificationChannelType.email
                    ? (channel.config.to as string[] | undefined)?.join(', ')
                    : (channel.config.webhookUrl as string | undefined)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <ChannelTestButton channelId={channel.id} />
                    <ChannelDialog
                      channel={channel}
                      onSaved={() => void refetch()}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Kanalı düzenle">
                          <PencilIcon className="size-4" />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Kanalı sil">
                          <TrashIcon className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Kanalı sil</AlertDialogTitle>
                          <AlertDialogDescription>
                            {channel.name} silinecek; bu kanalı kullanan alert kuralları artık bu kanala
                            bildirim gönderemez.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleDelete(channel.id)}>Sil</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
