import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { NotificationChannelType, type NotificationChannelResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CHANNEL_TYPE_LABELS: Record<NotificationChannelType, string> = {
  [NotificationChannelType.email]: 'E-posta',
  [NotificationChannelType.discord]: 'Discord',
  [NotificationChannelType.slack]: 'Slack',
}

const emailSchema = z.object({
  type: z.literal(NotificationChannelType.email),
  name: z.string().min(1, 'Ad gerekli').max(200),
  to: z.string().min(1, 'En az bir e-posta adresi girin'),
})

const webhookSchema = (type: typeof NotificationChannelType.discord | typeof NotificationChannelType.slack) =>
  z.object({
    type: z.literal(type),
    name: z.string().min(1, 'Ad gerekli').max(200),
    webhookUrl: z
      .string()
      .min(1, 'Webhook URL gerekli')
      .startsWith('https://', "URL 'https://' ile başlamalı"),
  })

const schema = z.discriminatedUnion('type', [
  emailSchema,
  webhookSchema(NotificationChannelType.discord),
  webhookSchema(NotificationChannelType.slack),
])

export type ChannelFormValues = z.infer<typeof schema>

export interface ChannelSubmitPayload {
  type: NotificationChannelType
  name: string
  config: Record<string, unknown>
}

function blankValuesForType(type: NotificationChannelType, name: string): ChannelFormValues {
  if (type === NotificationChannelType.email) {
    return { type, name, to: '' }
  }
  return { type, name, webhookUrl: '' }
}

function toDefaultValues(channel?: NotificationChannelResponseDto): ChannelFormValues {
  if (!channel) {
    return { type: NotificationChannelType.discord, name: '', webhookUrl: '' }
  }
  if (channel.type === NotificationChannelType.email) {
    const to = Array.isArray(channel.config.to) ? (channel.config.to as string[]).join(', ') : ''
    return { type: NotificationChannelType.email, name: channel.name, to }
  }
  return {
    type: channel.type as typeof NotificationChannelType.discord | typeof NotificationChannelType.slack,
    name: channel.name,
    webhookUrl: '',
  }
}

export function ChannelForm({
  channel,
  onSubmit,
  submitLabel,
}: {
  channel?: NotificationChannelResponseDto
  onSubmit: (payload: ChannelSubmitPayload) => Promise<void>
  submitLabel: string
}) {
  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(channel),
  })
  const type = form.watch('type')

  async function handleSubmit(values: ChannelFormValues) {
    const config =
      values.type === NotificationChannelType.email
        ? { to: values.to.split(',').map((item) => item.trim()).filter(Boolean) }
        : { webhookUrl: values.webhookUrl }
    await onSubmit({ type: values.type, name: values.name, config })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tip</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) =>
                  form.reset(blankValuesForType(value as NotificationChannelType, form.getValues('name')))
                }
                disabled={Boolean(channel)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(NotificationChannelType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {CHANNEL_TYPE_LABELS[value]}
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
              <FormLabel>Kanal adı</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {type === NotificationChannelType.email && (
          <FormField
            control={form.control}
            name="to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-posta adresleri (virgülle ayrılmış)</FormLabel>
                <FormControl>
                  <Input placeholder="ekip@example.com, patron@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {(type === NotificationChannelType.discord || type === NotificationChannelType.slack) && (
          <FormField
            control={form.control}
            name="webhookUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Webhook URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." {...field} />
                </FormControl>
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
