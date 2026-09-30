import { createFileRoute, Navigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useProjectsControllerFindOne, useProjectsControllerUpdate } from '@/api/projects/projects'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectForm, type ProjectFormValues } from '@/components/projects/project-form'
import { ErrorState, LoadingState } from '@/components/common/state-views'
import { ProjectNav } from '@/components/projects/project-nav'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/$projectId')({
  component: EditProjectPage,
})

function EditProjectPage() {
  const { projectId } = Route.useParams()
  const permissions = usePermissions()

  const { data, isPending, isError, refetch } = useProjectsControllerFindOne(projectId)
  const { mutateAsync: updateProject } = useProjectsControllerUpdate()

  if (!permissions.canManageProjects) return <Navigate to="/projects" />
  if (isPending) return <LoadingState />
  if (isError || data.status !== 200) return <ErrorState onRetry={() => refetch()} />

  const project = data.data

  async function onSubmit(values: ProjectFormValues) {
    const response = await updateProject({
      projectId,
      data: {
        clientId: values.clientId,
        name: values.name,
        domain: values.domain,
        dfsLocationCode: values.dfsLocationCode,
        dfsLanguageCode: values.dfsLanguageCode,
        status: values.status,
      },
    })
    if (response.status !== 200) {
      toast.error('Proje güncellenemedi.')
      return
    }
    toast.success('Proje güncellendi.')
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <ProjectNav projectId={projectId} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Proje bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm project={project} onSubmit={onSubmit} submitLabel="Kaydet" />
        </CardContent>
      </Card>
    </div>
  )
}
