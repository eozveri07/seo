import { createFileRoute, Navigate } from '@tanstack/react-router'
import { MailIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/state-views'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/notifications/')({
  component: NotificationChannelsPage,
})

function NotificationChannelsPage() {
  const permissions = usePermissions()

  if (!permissions.canManageNotificationChannels) return <Navigate to="/" search={{ clientId: undefined }} />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Bildirim kanalları</h1>
      <EmptyState
        title="Henüz bir bildirim kanalı yok"
        description="E-posta, Discord ve Slack entegrasyonları yakında burada yönetilecek."
        action={<MailIcon className="size-5 text-muted-foreground" />}
      />
    </div>
  )
}
