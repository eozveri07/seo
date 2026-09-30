import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useClientsControllerList } from '@/api/clients/clients'
import { useMembersControllerChangeRole } from '@/api/members/members'
import { OrgRole, type MemberResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const roleLabels: Record<OrgRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  analyst: 'Analist',
  client_viewer: 'Müşteri görüntüleyici',
}

const schema = z.object({
  role: z.enum(['owner', 'admin', 'analyst', 'client_viewer']),
  clientId: z.string().optional(),
})

export function ChangeRoleDialog({
  member,
  open,
  onOpenChange,
  onChanged,
}: {
  member: MemberResponseDto
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { role: member.role, clientId: member.clientId ?? undefined },
  })
  const role = form.watch('role')
  const { data: clientsData } = useClientsControllerList({ page: 1, limit: 200 }, { query: { enabled: open } })
  const clients = clientsData?.status === 200 ? clientsData.data.items : []
  const { mutateAsync } = useMembersControllerChangeRole()

  async function onSubmit(values: z.infer<typeof schema>) {
    if (values.role === OrgRole.client_viewer && !values.clientId) {
      form.setError('clientId', { message: 'client_viewer için müşteri seçin' })
      return
    }
    const response = await mutateAsync({
      userId: member.userId,
      data: {
        role: values.role,
        clientId: values.role === OrgRole.client_viewer ? values.clientId : undefined,
      },
    })
    if (response.status !== 200) {
      toast.error('Rol değiştirilemedi.')
      return
    }
    toast.success('Rol güncellendi.')
    onChanged()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rolü değiştir</DialogTitle>
          <DialogDescription>{member.name} için yeni rolü seçin.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(OrgRole).map((value) => (
                        <SelectItem key={value} value={value}>
                          {roleLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {role === OrgRole.client_viewer && (
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Müşteri</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Müşteri seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Kaydet
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
