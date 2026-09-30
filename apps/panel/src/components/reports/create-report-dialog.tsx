import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useReportsControllerCreate } from '@/api/reports/reports'
import { ReportType } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { REPORT_TYPE_LABELS } from './report-labels'

const schema = z.object({
  type: z.nativeEnum(ReportType),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  analystNote: z.string().max(4000).optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateReportDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const { mutateAsync: createReport } = useReportsControllerCreate()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: ReportType.monthly,
      periodStart: '',
      periodEnd: '',
      analystNote: '',
    },
  })

  async function handleSubmit(values: FormValues) {
    if (!values.periodStart || !values.periodEnd) {
      form.setError('periodEnd', { message: 'Dönem seçin' })
      return
    }
    const response = await createReport({
      projectId,
      data: {
        type: values.type,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        analystNote: values.analystNote || undefined,
      },
    })
    if (response.status !== 201) {
      toast.error('Rapor oluşturulamadı.')
      return
    }
    toast.success('Rapor oluşturuluyor.')
    setOpen(false)
    form.reset()
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Rapor oluştur
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni rapor</DialogTitle>
        </DialogHeader>
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
                      {Object.values(ReportType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {REPORT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Dönem</FormLabel>
              <DateRangePicker
                value={{
                  from: form.watch('periodStart') || new Date().toISOString().slice(0, 10),
                  to: form.watch('periodEnd') || new Date().toISOString().slice(0, 10),
                }}
                onChange={(range) => {
                  form.setValue('periodStart', range.from)
                  form.setValue('periodEnd', range.to)
                }}
              />
              <FormMessage>{form.formState.errors.periodEnd?.message}</FormMessage>
            </FormItem>
            <FormField
              control={form.control}
              name="analystNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Analist notu</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder="Raporda görünecek yorum (opsiyonel)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
              Oluştur
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
