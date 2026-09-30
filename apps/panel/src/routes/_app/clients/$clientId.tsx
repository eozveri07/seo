import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useState } from 'react'
import { TrashIcon } from 'lucide-react'
import {
  useClientsControllerDelete,
  useClientsControllerFindOne,
  useClientsControllerUpdate,
} from '@/api/clients/clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ClientForm, type ClientFormSubmitValues } from '@/components/clients/client-form'
import { ErrorState, LoadingState } from '@/components/common/state-views'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/clients/$clientId')({
  component: EditClientPage,
})

function EditClientPage() {
  const { clientId } = Route.useParams()
  const navigate = useNavigate()
  const permissions = usePermissions()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data, isPending, isError, refetch } = useClientsControllerFindOne(clientId)
  const { mutateAsync: updateClient } = useClientsControllerUpdate()
  const { mutateAsync: deleteClient } = useClientsControllerDelete()

  if (!permissions.canManageClients) return <Navigate to="/clients" />
  if (isPending) return <LoadingState />
  if (isError || data.status !== 200) return <ErrorState onRetry={() => refetch()} />

  const client = data.data

  async function onSubmit(values: ClientFormSubmitValues) {
    const response = await updateClient({ clientId, data: values })
    if (response.status !== 200) {
      toast.error('Müşteri güncellenemedi.')
      return
    }
    toast.success('Müşteri güncellendi.')
  }

  async function onDelete() {
    const response = await deleteClient({ clientId })
    if (response.status !== 204) {
      toast.error('Müşteri silinemedi.')
      return
    }
    toast.success('Müşteri silindi.')
    void navigate({ to: '/clients' })
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
        {permissions.canManageClients && (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <TrashIcon className="size-4" />
                Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Müşteriyi sil</AlertDialogTitle>
                <AlertDialogDescription>
                  {client.name} silinecek. Bu işlem geri alınamaz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onDelete()}>Sil</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Müşteri bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm client={client} onSubmit={onSubmit} submitLabel="Kaydet" />
        </CardContent>
      </Card>
    </div>
  )
}
