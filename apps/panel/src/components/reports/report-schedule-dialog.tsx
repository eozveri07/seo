import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  useReportSchedulesControllerCreate,
  useReportSchedulesControllerUpdate,
} from '@/api/reports/reports'
import type { ReportScheduleResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ReportScheduleForm, type ReportScheduleSubmitPayload } from './report-schedule-form'

export function ReportScheduleDialog({
  projectId,
  schedule,
  onSaved,
  trigger,
}: {
  projectId: string
  schedule?: ReportScheduleResponseDto
  onSaved: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { mutateAsync: createSchedule } = useReportSchedulesControllerCreate()
  const { mutateAsync: updateSchedule } = useReportSchedulesControllerUpdate()

  async function handleSubmit(payload: ReportScheduleSubmitPayload) {
    const response = schedule
      ? await updateSchedule({ projectId, scheduleId: schedule.id, data: payload })
      : await createSchedule({ projectId, data: payload })
    if (response.status !== 200 && response.status !== 201) {
      toast.error('Zamanlama kaydedilemedi.')
      return
    }
    toast.success(schedule ? 'Zamanlama güncellendi.' : 'Zamanlama eklendi.')
    setOpen(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon className="size-4" />
            Zamanlama ekle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Zamanlamayı düzenle' : 'Yeni zamanlama'}</DialogTitle>
        </DialogHeader>
        <ReportScheduleForm schedule={schedule} onSubmit={handleSubmit} submitLabel={schedule ? 'Kaydet' : 'Ekle'} />
      </DialogContent>
    </Dialog>
  )
}
