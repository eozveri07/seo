import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useConnectionsControllerCreate } from '@/api/connections/connections'
import { CreateConnectionDtoType, type ConnectionResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ConnectionStatusPanel } from './connection-status-panel'

const schema = z.object({
  propertyId: z.string().regex(/^\d+$/, 'Yalnızca rakam girin'),
})

export function Ga4ConnectionCard({
  projectId,
  connection,
  onCreated,
}: {
  projectId: string
  connection: ConnectionResponseDto | undefined
  onCreated: () => void
}) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { propertyId: '' },
  })
  const { mutateAsync: createConnection } = useConnectionsControllerCreate()

  async function onSubmit(values: z.infer<typeof schema>) {
    const response = await createConnection({
      projectId,
      data: { type: CreateConnectionDtoType.ga4, externalId: `properties/${values.propertyId}` },
    })
    if (response.status !== 201) {
      toast.error('GA4 bağlantısı oluşturulamadı.')
      return
    }
    toast.success('GA4 bağlantısı oluşturuldu, doğrulayabilirsiniz.')
    onCreated()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Analytics 4</CardTitle>
        <CardDescription>Mülk numarasını girin.</CardDescription>
      </CardHeader>
      <CardContent>
        {connection ? (
          <ConnectionStatusPanel connection={connection} />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GA4 mülk numarası</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789" {...field} />
                    </FormControl>
                    <FormDescription>GA4 yönetici panelinde "Mülk ayarları" altında bulunur.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
                Bağla
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
