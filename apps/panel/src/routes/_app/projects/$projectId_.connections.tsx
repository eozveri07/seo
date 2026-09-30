import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useConnectionsControllerList } from '@/api/connections/connections'
import { ConnectionType } from '@/api/endpoints.schemas'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { Ga4ConnectionCard } from '@/components/connections/ga4-connection-card'
import { GscConnectionCard } from '@/components/connections/gsc-connection-card'
import { ServiceAccountCard } from '@/components/connections/service-account-card'
import { ErrorState, LoadingState } from '@/components/common/state-views'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/$projectId_/connections')({
  component: ProjectConnectionsPage,
})

const RUNNING_POLL_INTERVAL_MS = 3000

function ProjectConnectionsPage() {
  const { projectId } = Route.useParams()
  const permissions = usePermissions()

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const { data, isPending, isError, refetch } = useConnectionsControllerList(projectId, {
    query: {
      refetchInterval: (query) => {
        const result = query.state.data
        if (result?.status !== 200) return false
        const hasRunning = result.data.items.some(
          (connection) => connection.backfillStatus === 'pending' || connection.backfillStatus === 'running',
        )
        return hasRunning ? RUNNING_POLL_INTERVAL_MS : false
      },
    },
  })

  if (!permissions.canManageConnections) return <Navigate to="/projects" />
  if (isPending) return <LoadingState />
  if (isError || data.status !== 200) return <ErrorState onRetry={() => refetch()} />

  const connections = data.data.items
  const gscConnection = connections.find((connection) => connection.type === ConnectionType.gsc)
  const ga4Connection = connections.find((connection) => connection.type === ConnectionType.ga4)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Bağlantılar{projectName ? ` — ${projectName}` : ''}
      </h1>
      <ServiceAccountCard />
      <GscConnectionCard projectId={projectId} connection={gscConnection} onCreated={() => void refetch()} />
      <Ga4ConnectionCard projectId={projectId} connection={ga4Connection} onCreated={() => void refetch()} />
    </div>
  )
}
