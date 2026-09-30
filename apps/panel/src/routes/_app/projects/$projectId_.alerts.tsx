import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useAlertEventsControllerList, useAlertRulesControllerList, useNotificationChannelsControllerList } from '@/api/alerts/alerts'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { AlertEventTable } from '@/components/alerts/alert-event-table'
import { AlertRuleDialog } from '@/components/alerts/alert-rule-dialog'
import { AlertRuleTable } from '@/components/alerts/alert-rule-table'
import { ProjectNav } from '@/components/projects/project-nav'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/$projectId_/alerts')({
  component: ProjectAlertsPage,
})

function ProjectAlertsPage() {
  const { projectId } = Route.useParams()
  const permissions = usePermissions()

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  const rulesQuery = useAlertRulesControllerList(projectId, { page: 1, limit: 200 })
  const rules = rulesQuery.data?.status === 200 ? rulesQuery.data.data.items : []

  const eventsQuery = useAlertEventsControllerList(projectId, { page: 1, limit: 50 })
  const events = eventsQuery.data?.status === 200 ? eventsQuery.data.data.items : []

  const channelsQuery = useNotificationChannelsControllerList()
  const channelsById = useMemo(() => {
    const items = channelsQuery.data?.status === 200 ? channelsQuery.data.data.items : []
    return new Map(items.map((channel) => [channel.id, channel]))
  }, [channelsQuery.data])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{projectName ? `Alertler — ${projectName}` : 'Alertler'}</h1>
        <ProjectNav projectId={projectId} />
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Kurallar</TabsTrigger>
          <TabsTrigger value="history">Geçmiş</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="flex flex-col gap-4">
          {permissions.canManageKeywords && (
            <div className="flex justify-end">
              <AlertRuleDialog projectId={projectId} onSaved={() => void rulesQuery.refetch()} />
            </div>
          )}
          {rulesQuery.isPending && <LoadingState rows={3} />}
          {!rulesQuery.isPending && rulesQuery.isError && <ErrorState onRetry={() => void rulesQuery.refetch()} />}
          {!rulesQuery.isPending && !rulesQuery.isError && rules.length === 0 && (
            <EmptyState
              title="Henüz alert kuralı yok"
              description="Pozisyon düşüşü, top N'den çıkış, trafik düşüşü ya da senkronizasyon hatası için kural ekleyin."
            />
          )}
          {!rulesQuery.isPending && !rulesQuery.isError && rules.length > 0 && (
            <AlertRuleTable
              projectId={projectId}
              rules={rules}
              channelsById={channelsById}
              onChanged={() => void rulesQuery.refetch()}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-4">
          {eventsQuery.isPending && <LoadingState rows={3} />}
          {!eventsQuery.isPending && eventsQuery.isError && <ErrorState onRetry={() => void eventsQuery.refetch()} />}
          {!eventsQuery.isPending && !eventsQuery.isError && events.length === 0 && (
            <EmptyState title="Henüz alert tetiklenmedi" description="Kurallar değerlendirildikçe burada listelenecek." />
          )}
          {!eventsQuery.isPending && !eventsQuery.isError && events.length > 0 && (
            <AlertEventTable events={events} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
