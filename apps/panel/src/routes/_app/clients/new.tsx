import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useClientsControllerCreate } from '@/api/clients/clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientForm, type ClientFormSubmitValues } from '@/components/clients/client-form'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/clients/new')({
  component: NewClientPage,
})

function NewClientPage() {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const { mutateAsync } = useClientsControllerCreate()

  if (!permissions.canManageClients) {
    return <Navigate to="/clients" />
  }

  async function onSubmit(values: ClientFormSubmitValues) {
    const response = await mutateAsync({ data: values })
    if (response.status !== 201) {
      toast.error('Müşteri oluşturulamadı.')
      return
    }
    toast.success('Müşteri oluşturuldu.')
    void navigate({ to: '/clients' })
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Yeni müşteri</h1>
      <Card>
        <CardHeader>
          <CardTitle>Müşteri bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm onSubmit={onSubmit} submitLabel="Oluştur" />
        </CardContent>
      </Card>
    </div>
  )
}
