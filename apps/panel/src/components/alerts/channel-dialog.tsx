import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { NotificationChannelResponseDto } from '@/api/endpoints.schemas'
import {
  useNotificationChannelsControllerCreate,
  useNotificationChannelsControllerUpdate,
} from '@/api/alerts/alerts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ChannelForm, type ChannelSubmitPayload } from './channel-form'

export function ChannelDialog({
  channel,
  onSaved,
  trigger,
}: {
  channel?: NotificationChannelResponseDto
  onSaved: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { mutateAsync: createChannel } = useNotificationChannelsControllerCreate()
  const { mutateAsync: updateChannel } = useNotificationChannelsControllerUpdate()

  async function handleSubmit(payload: ChannelSubmitPayload) {
    const response = channel
      ? await updateChannel({ channelId: channel.id, data: { name: payload.name, config: payload.config } })
      : await createChannel({ data: payload })
    if (response.status !== 200 && response.status !== 201) {
      toast.error('Kanal kaydedilemedi.')
      return
    }
    toast.success(channel ? 'Kanal güncellendi.' : 'Kanal eklendi.')
    setOpen(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon className="size-4" />
            Kanal ekle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channel ? 'Kanalı düzenle' : 'Yeni bildirim kanalı'}</DialogTitle>
        </DialogHeader>
        <ChannelForm channel={channel} onSubmit={handleSubmit} submitLabel={channel ? 'Kaydet' : 'Ekle'} />
      </DialogContent>
    </Dialog>
  )
}
