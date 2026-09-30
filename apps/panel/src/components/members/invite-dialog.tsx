import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useClientsControllerList } from '@/api/clients/clients'
import { useInvitationsControllerCreate } from '@/api/invitations/invitations'
import { OrgRole } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlusIcon } from 'lucide-react'

const roleLabels: Record<OrgRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  analyst: 'Analist',
  client_viewer: 'Müşteri görüntüleyici',
}

const schema = z.object({
  email: z.email('Geçerli bir e-posta girin'),
  role: z.enum(['owner', 'admin', 'analyst', 'client_viewer']),
  clientId: z.string().optional(),
})

export function InviteDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: OrgRole.analyst, clientId: undefined },
  })
  const role = form.watch('role')
  const { data: clientsData } = useClientsControllerList({ page: 1, limit: 200 }, { query: { enabled: open } })
  const clients = clientsData?.status === 200 ? clientsData.data.items : []
  const { mutateAsync } = useInvitationsControllerCreate()

  async function onSubmit(values: z.infer<typeof schema>) {
    if (values.role === OrgRole.client_viewer && !values.clientId) {
      form.setError('clientId', { message: 'client_viewer için müşteri seçin' })
      return
    }
    const response = await mutateAsync({
      data: {
        email: values.email,
        role: values.role,
        clientId: values.role === OrgRole.client_viewer ? values.clientId : undefined,
      },
    })
    if (response.status !== 201) {
      toast.error('Davet oluşturulamadı.')
      return
    }
    toast.success(response.data.emailSent ? 'Davet gönderildi.' : 'Davet oluşturuldu ama e-posta gönderilemedi.')
    form.reset({ email: '', role: OrgRole.analyst, clientId: undefined })
    setOpen(false)
    onInvited()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Davet gönder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Üye davet et</DialogTitle>
          <DialogDescription>E-posta ve rolü belirleyin, davet bağlantısı gönderilecek.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-posta</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                Davet gönder
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
