import { DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ReportResponseDto } from '@/api/endpoints.schemas'
import { ReportStatus } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadReport } from './download-report'
import { REPORT_STATUS_BADGE_VARIANT, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from './report-labels'

export function ReportTable({ projectId, reports }: { projectId: string; reports: ReportResponseDto[] }) {
  async function handleDownload(report: ReportResponseDto) {
    try {
      await downloadReport(projectId, report.id, `${report.type}-${report.periodStart}-${report.periodEnd}.pdf`)
    } catch {
      toast.error('Rapor indirilemedi.')
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dönem</TableHead>
          <TableHead>Tip</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead>Oluşturulma</TableHead>
          <TableHead>Gönderim</TableHead>
          <TableHead className="text-right">Aksiyonlar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="font-medium">
              {report.periodStart} – {report.periodEnd}
            </TableCell>
            <TableCell>{REPORT_TYPE_LABELS[report.type]}</TableCell>
            <TableCell>
              <Badge variant={REPORT_STATUS_BADGE_VARIANT[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
              {report.status === ReportStatus.failed && report.error && (
                <p className="mt-1 text-xs text-destructive">{report.error}</p>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{report.generatedAt ?? '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {report.sentTo.length > 0 ? report.sentTo.join(', ') : '—'}
            </TableCell>
            <TableCell>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="PDF indir"
                  disabled={report.status !== ReportStatus.ready}
                  onClick={() => void handleDownload(report)}
                >
                  <DownloadIcon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
