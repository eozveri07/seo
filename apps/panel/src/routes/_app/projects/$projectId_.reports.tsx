import { createFileRoute } from '@tanstack/react-router'
import { useReportsControllerList, useReportSchedulesControllerList } from '@/api/reports/reports'
import { useProjectsControllerFindOne } from '@/api/projects/projects'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { CreateReportDialog } from '@/components/reports/create-report-dialog'
import { ReportScheduleDialog } from '@/components/reports/report-schedule-dialog'
import { ReportScheduleTable } from '@/components/reports/report-schedule-table'
import { ReportTable } from '@/components/reports/report-table'
import { ProjectNav } from '@/components/projects/project-nav'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/$projectId_/reports')({
  component: ProjectReportsPage,
})

function ProjectReportsPage() {
  const { projectId } = Route.useParams()
  const permissions = usePermissions()

  const { data: projectData } = useProjectsControllerFindOne(projectId)
  const projectName = projectData?.status === 200 ? projectData.data.name : undefined

  const reportsQuery = useReportsControllerList(projectId, { page: 1, limit: 50 })
  const reports = reportsQuery.data?.status === 200 ? reportsQuery.data.data.items : []

  const schedulesQuery = useReportSchedulesControllerList(projectId)
  const schedules = schedulesQuery.data?.status === 200 ? schedulesQuery.data.data.items : []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{projectName ? `Raporlar — ${projectName}` : 'Raporlar'}</h1>
        <ProjectNav projectId={projectId} />
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Raporlar</TabsTrigger>
          <TabsTrigger value="schedules">Zamanlamalar</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="flex flex-col gap-4">
          {permissions.canManageKeywords && (
            <div className="flex justify-end">
              <CreateReportDialog projectId={projectId} onCreated={() => void reportsQuery.refetch()} />
            </div>
          )}
          {reportsQuery.isPending && <LoadingState rows={3} />}
          {!reportsQuery.isPending && reportsQuery.isError && <ErrorState onRetry={() => void reportsQuery.refetch()} />}
          {!reportsQuery.isPending && !reportsQuery.isError && reports.length === 0 && (
            <EmptyState
              title="Henüz rapor yok"
              description="Bir dönem seçip rapor oluşturun; PDF hazır olduğunda buradan indirebilirsiniz."
            />
          )}
          {reports.length > 0 && <ReportTable projectId={projectId} reports={reports} />}
        </TabsContent>

        <TabsContent value="schedules" className="flex flex-col gap-4">
          {permissions.canManageKeywords && (
            <div className="flex justify-end">
              <ReportScheduleDialog projectId={projectId} onSaved={() => void schedulesQuery.refetch()} />
            </div>
          )}
          {schedulesQuery.isPending && <LoadingState rows={3} />}
          {!schedulesQuery.isPending && schedulesQuery.isError && (
            <ErrorState onRetry={() => void schedulesQuery.refetch()} />
          )}
          {!schedulesQuery.isPending && !schedulesQuery.isError && schedules.length === 0 && (
            <EmptyState
              title="Henüz zamanlama yok"
              description="Haftalık ya da aylık otomatik rapor göndermek için bir zamanlama ekleyin."
            />
          )}
          {schedules.length > 0 && (
            <ReportScheduleTable
              projectId={projectId}
              schedules={schedules}
              onChanged={() => void schedulesQuery.refetch()}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
