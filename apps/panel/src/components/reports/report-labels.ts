import { ReportStatus, ReportType } from '@/api/endpoints.schemas'

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  [ReportType.weekly]: 'Haftalık',
  [ReportType.monthly]: 'Aylık',
  [ReportType.custom]: 'Özel',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  [ReportStatus.queued]: 'Kuyrukta',
  [ReportStatus.rendering]: 'Oluşturuluyor',
  [ReportStatus.ready]: 'Hazır',
  [ReportStatus.failed]: 'Başarısız',
}

export const REPORT_STATUS_BADGE_VARIANT: Record<
  ReportStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  [ReportStatus.queued]: 'outline',
  [ReportStatus.rendering]: 'secondary',
  [ReportStatus.ready]: 'default',
  [ReportStatus.failed]: 'destructive',
}
