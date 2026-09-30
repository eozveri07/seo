/** `notify` processor'ının (alerts modülü) rapor bildirimleri için kullandığı arayüz. */
export interface ReportNotifier {
  notifyReport(reportId: string): Promise<void>;
}

export const REPORT_NOTIFIER = Symbol('REPORT_NOTIFIER');
