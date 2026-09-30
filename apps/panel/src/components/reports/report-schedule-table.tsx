import { PencilIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useReportSchedulesControllerDelete } from '@/api/reports/reports'
import type { ReportScheduleResponseDto } from '@/api/endpoints.schemas'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { REPORT_TYPE_LABELS } from './report-labels'
import { ReportScheduleDialog } from './report-schedule-dialog'

export function ReportScheduleTable({
  projectId,
  schedules,
  onChanged,
}: {
  projectId: string
  schedules: ReportScheduleResponseDto[]
  onChanged: () => void
}) {
  const { mutateAsync: deleteSchedule } = useReportSchedulesControllerDelete()

  async function handleDelete(id: string) {
    const response = await deleteSchedule({ projectId, scheduleId: id })
    if (response.status !== 204) {
      toast.error('Zamanlama silinemedi.')
      return
    }
    toast.success('Zamanlama silindi.')
    onChanged()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tip</TableHead>
          <TableHead>Cron</TableHead>
          <TableHead>Saat dilimi</TableHead>
          <TableHead>Alıcılar</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="text-right">Aksiyonlar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {schedules.map((schedule) => (
          <TableRow key={schedule.id}>
            <TableCell className="font-medium">{REPORT_TYPE_LABELS[schedule.type]}</TableCell>
            <TableCell className="font-mono text-sm">{schedule.cron}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{schedule.timezone}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{schedule.recipients.join(', ')}</TableCell>
            <TableCell>
              <Badge variant={schedule.isActive ? 'default' : 'outline'}>
                {schedule.isActive ? 'Aktif' : 'Pasif'}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <ReportScheduleDialog
                  projectId={projectId}
                  schedule={schedule}
                  onSaved={onChanged}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Zamanlamayı düzenle">
                      <PencilIcon className="size-4" />
                    </Button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Zamanlamayı sil">
                      <TrashIcon className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Zamanlamayı sil</AlertDialogTitle>
                      <AlertDialogDescription>
                        {REPORT_TYPE_LABELS[schedule.type]} zamanlaması silinecek.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleDelete(schedule.id)}>Sil</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
