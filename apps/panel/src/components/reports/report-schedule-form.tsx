import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CreateReportScheduleDtoType, type ReportScheduleResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { REPORT_TYPE_LABELS } from './report-labels'

const schema = z.object({
  type: z.nativeEnum(CreateReportScheduleDtoType),
  cron: z.string().min(1, 'Cron ifadesi gerekli'),
  timezone: z.string().min(1, 'Saat dilimi gerekli'),
  recipients: z.string(),
  isActive: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export type ReportScheduleSubmitPayload = {
  type: CreateReportScheduleDtoType
  cron: string
  timezone: string
  recipients: string[]
  isActive: boolean
}

function toDefaultValues(schedule?: ReportScheduleResponseDto): FormValues {
  return {
    type: (schedule?.type as CreateReportScheduleDtoType) ?? CreateReportScheduleDtoType.weekly,
    cron: schedule?.cron ?? '0 9 * * 1',
    timezone: schedule?.timezone ?? 'Europe/Istanbul',
    recipients: schedule?.recipients.join(', ') ?? '',
    isActive: schedule?.isActive ?? true,
  }
}

export function ReportScheduleForm({
  schedule,
  onSubmit,
  submitLabel,
}: {
  schedule?: ReportScheduleResponseDto
  onSubmit: (values: ReportScheduleSubmitPayload) => Promise<void>
  submitLabel: string
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(schedule),
  })

  async function handleSubmit(values: FormValues) {
    const recipients = values.recipients
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      form.setError('recipients', { message: 'En az bir alıcı gerekli' })
      return
    }
    await onSubmit({ ...values, recipients })
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
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={CreateReportScheduleDtoType.weekly}>
                    {REPORT_TYPE_LABELS.weekly}
                  </SelectItem>
                  <SelectItem value={CreateReportScheduleDtoType.monthly}>
                    {REPORT_TYPE_LABELS.monthly}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cron"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cron</FormLabel>
              <FormControl>
                <Input placeholder="0 9 * * 1" {...field} />
              </FormControl>
              <FormDescription>Örn: &quot;0 9 * * 1&quot; — her Pazartesi 09:00.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Saat dilimi</FormLabel>
              <FormControl>
                <Input placeholder="Europe/Istanbul" {...field} />
              </FormControl>
              <FormDescription>IANA saat dilimi kimliği, ör. &quot;Europe/Istanbul&quot;.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="recipients"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alıcılar</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="virgülle ya da satır satır ayırın" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <Label className="font-normal">Aktif</Label>
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
