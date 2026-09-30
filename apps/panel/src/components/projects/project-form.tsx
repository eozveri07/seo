import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useClientsControllerList } from '@/api/clients/clients'
import { CreateProjectDtoStatus, type ProjectResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationLanguageSelect } from './location-language-select'

const schema = z.object({
  clientId: z.string().min(1, 'Müşteri seçin'),
  name: z.string().min(1, 'Ad gerekli').max(200),
  domain: z.string().min(1, 'Domain gerekli').max(255),
  dfsLocationCode: z.number().optional(),
  dfsLanguageCode: z.string().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
})

export type ProjectFormValues = z.infer<typeof schema>

function toDefaultValues(project?: ProjectResponseDto, initialClientId?: string): ProjectFormValues {
  return {
    clientId: project?.clientId ?? initialClientId ?? '',
    name: project?.name ?? '',
    domain: project?.domain ?? '',
    dfsLocationCode: project?.dfsLocationCode ?? undefined,
    dfsLanguageCode: project?.dfsLanguageCode ?? undefined,
    status: project?.status,
  }
}

const statusLabels: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivlendi',
}

export function ProjectForm({
  project,
  initialClientId,
  onSubmit,
  submitLabel,
}: {
  project?: ProjectResponseDto
  initialClientId?: string
  onSubmit: (values: ProjectFormValues) => Promise<void>
  submitLabel: string
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(project, initialClientId),
  })

  const { data: clientsData, isPending: clientsPending } = useClientsControllerList({ page: 1, limit: 200 })
  const clients = clientsData?.status === 200 ? clientsData.data.items : []

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Müşteri</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={clientsPending}>
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
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proje adı</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="domain"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Domain</FormLabel>
              <FormControl>
                <Input placeholder="example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>Lokasyon ve dil</FormLabel>
          <Controller
            control={form.control}
            name="dfsLocationCode"
            render={({ field: locationField }) => (
              <Controller
                control={form.control}
                name="dfsLanguageCode"
                render={({ field: languageField }) => (
                  <LocationLanguageSelect
                    locationCode={locationField.value}
                    languageCode={languageField.value}
                    onChange={(value) => {
                      locationField.onChange(value.locationCode)
                      languageField.onChange(value.languageCode)
                    }}
                  />
                )}
              />
            )}
          />
        </FormItem>
        {project && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Durum</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Durum seçin" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(CreateProjectDtoStatus).map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status] ?? status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
          {submitLabel}
        </Button>
      </form>
    </Form>
  )
}
