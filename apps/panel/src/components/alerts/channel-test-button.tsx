import { SendIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useNotificationChannelsControllerTest } from '@/api/alerts/alerts'
import { Button } from '@/components/ui/button'

export function ChannelTestButton({ channelId }: { channelId: string }) {
  const { mutateAsync, isPending } = useNotificationChannelsControllerTest()

  async function handleTest() {
    const response = await mutateAsync({ channelId })
    if (response.status !== 204) {
      toast.error('Test bildirimi gönderilemedi. Kanal ayarlarını kontrol edin.')
      return
    }
    toast.success('Test bildirimi gönderildi.')
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={isPending}>
      <SendIcon className="size-4" />
      Test et
    </Button>
  )
}
