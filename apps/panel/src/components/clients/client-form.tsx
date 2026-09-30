import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ClientResponseDto } from '@/api/endpoints.schemas'

const schema = z.object({
  name: z.string().min(1, 'Ad gerekli').max(200),
  contactEmails: z.string(),
  notes: z.string().max(5000).optional(),
})

export type ClientFormValues = z.infer<typeof schema>

export type ClientFormSubmitValues = {
  name: string
  contactEmails: string[]
  notes?: string
}

function toDefaultValues(client?: ClientResponseDto): ClientFormValues {
  return {
    name: client?.name ?? '',
    contactEmails: client?.contactEmails.join(', ') ?? '',
    notes: client?.notes ?? '',
  }
}

export function ClientForm({
  client,
  onSubmit,
  submitLabel,
}: {
  client?: ClientResponseDto
  onSubmit: (values: ClientFormSubmitValues) => Promise<void>
  submitLabel: string
}) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(client),
  })

  async function handleSubmit(values: ClientFormValues) {
    const contactEmails = values.contactEmails
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter(Boolean)
    await onSubmit({ name: values.name, contactEmails, notes: values.notes || undefined })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Müşteri adı</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactEmails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>İletişim e-postaları</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="virgülle ya da satır satır ayırın" {...field} />
              </FormControl>
              <FormDescription>Rapor ve alertlerin gönderileceği adresler.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notlar</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
          {submitLabel}
        </Button>
      </form>
    </Form>
  )
}
