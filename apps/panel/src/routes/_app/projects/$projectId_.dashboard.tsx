import { createFileRoute } from '@tanstack/react-router'
import { useConnectionsControllerList } from '@/api/connections/connections'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { useSummaryControllerForProject } from '@/api/summary/summary'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GscTrendChart } from '@/components/dashboard/gsc-trend-chart'
import { SessionsChart } from '@/components/dashboard/sessions-chart'
import { PositionDistributionChart } from '@/components/dashboard/position-distribution-chart'
import { KpiRow } from '@/components/dashboard/kpi-row'
import { SyncStatusCard } from '@/components/dashboard/sync-status-card'
import { ProjectNav } from '@/components/projects/project-nav'
import { defaultDateRange, isValidIsoDate, previousPeriod } from '@/lib/date-range'

export const Route = createFileRoute('/_app/projects/$projectId_/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    from: isValidIsoDate(search.from) ? search.from : undefined,
    to: isValidIsoDate(search.to) ? search.to : undefined,
  }),
  component: ProjectDashboardPage,
})

function ProjectDashboardPage() {
  const { projectId } = Route.useParams()
  const rawSearch = Route.useSearch()
  const navigate = Route.useNavigate()
  const { from, to } = rawSearch.from && rawSearch.to ? { from: rawSearch.from, to: rawSearch.to } : defaultDateRange()

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  const prevRange = previousPeriod({ from, to })

  const current = useSummaryControllerForProject(projectId, { from, to })
  const previous = useSummaryControllerForProject(projectId, { from: prevRange.from, to: prevRange.to })
  const connectionsQuery = useConnectionsControllerList(projectId)

  const isPending = current.isPending || connectionsQuery.isPending
  const isError = current.isError || (current.data && current.data.status !== 200)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{projectName ?? 'Proje özeti'}</h1>
        <ProjectNav projectId={projectId} />
      </div>

      <div className="flex justify-end">
        <DateRangePicker value={{ from, to }} onChange={(range) => void navigate({ search: range })} />
      </div>

      {isPending && <LoadingState rows={4} />}

      {!isPending && isError && <ErrorState onRetry={() => current.refetch()} />}

      {!isPending && !isError && current.data?.status === 200 && (
        <>
          {current.data.data.points.length === 0 ? (
            <EmptyState
              title="Bu dönemde veri yok"
              description="Bağlantı eklenmemiş olabilir ya da senkronizasyon henüz tamamlanmadı."
            />
          ) : (
            <>
              <KpiRow
                current={current.data.data.points}
                previous={previous.data?.status === 200 ? previous.data.data.points : null}
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GSC tıklama ve gösterim</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <GscTrendChart points={current.data.data.points} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Organik oturum</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SessionsChart points={current.data.data.points} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pozisyon dağılımı</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PositionDistributionChart
                      latest={current.data.data.points[current.data.data.points.length - 1] ?? null}
                    />
                  </CardContent>
                </Card>
                {connectionsQuery.data?.status === 200 ? (
                  <SyncStatusCard connections={connectionsQuery.data.data.items} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Senkronizasyon durumu</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Bağlantı durumu okunamadı.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
