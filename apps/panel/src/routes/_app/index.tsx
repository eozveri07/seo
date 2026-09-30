import { createFileRoute } from '@tanstack/react-router'
import { useClientsControllerList } from '@/api/clients/clients'
import { useProjectsControllerCards } from '@/api/projects/projects'
import { ProjectCard } from '@/components/dashboard/project-card'
import { EmptyState, ErrorState } from '@/components/common/state-views'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
  }),
  component: OrgHomePage,
})

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  )
}

function OrgHomePage() {
  const { clientId } = Route.useSearch()
  const navigate = Route.useNavigate()

  const { data: clientsData } = useClientsControllerList({ page: 1, limit: 200 })
  const clients = clientsData?.status === 200 ? clientsData.data.items : []

  const { data, isPending, isError, refetch } = useProjectsControllerCards({ clientId })
  const cards = data?.status === 200 ? data.data.items : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ana sayfa</h1>
        {clients.length > 0 && (
          <Select
            value={clientId ?? 'all'}
            onValueChange={(value) => void navigate({ search: { clientId: value === 'all' ? undefined : value } })}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Tüm müşteriler" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm müşteriler</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isPending && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && isError && <ErrorState onRetry={() => refetch()} />}

      {!isPending && !isError && cards.length === 0 && (
        <EmptyState
          title="Henüz proje yok"
          description="Bir müşteri ve proje ekleyerek başlayın; özet verisi ilk senkronizasyondan sonra görünür."
        />
      )}

      {!isPending && !isError && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <ProjectCard key={card.projectId} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
