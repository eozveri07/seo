import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useProjectsControllerCreate } from '@/api/projects/projects'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectForm, type ProjectFormValues } from '@/components/projects/project-form'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
  }),
  component: NewProjectPage,
})

function NewProjectPage() {
  const { clientId } = Route.useSearch()
  const navigate = useNavigate()
  const permissions = usePermissions()
  const { mutateAsync } = useProjectsControllerCreate()

  if (!permissions.canManageProjects) {
    return <Navigate to="/projects" />
  }

  async function onSubmit(values: ProjectFormValues) {
    const response = await mutateAsync({
      data: {
        clientId: values.clientId,
        name: values.name,
        domain: values.domain,
        dfsLocationCode: values.dfsLocationCode,
        dfsLanguageCode: values.dfsLanguageCode,
      },
    })
    if (response.status !== 201) {
      toast.error('Proje oluşturulamadı.')
      return
    }
    toast.success('Proje oluşturuldu.')
    void navigate({ to: '/projects/$projectId', params: { projectId: response.data.id } })
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Yeni proje</h1>
      <Card>
        <CardHeader>
          <CardTitle>Proje bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm initialClientId={clientId} onSubmit={onSubmit} submitLabel="Oluştur" />
        </CardContent>
      </Card>
    </div>
  )
}
