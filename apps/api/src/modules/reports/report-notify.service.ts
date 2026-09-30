import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { MailService } from '../../infra/mail/mail.service';
import { STORAGE_SERVICE } from '../../infra/storage/storage.interface';
import type { StorageService } from '../../infra/storage/storage.interface';
import { Report, ReportStatus } from './entities/report.entity';
import { ReportNotifier } from './report-notifier';
import { ReportNotReadyError } from './reports.errors';

/**
 * `notify` job'unun rapor kolu (ARCHITECTURE §12): PDF'i storage'dan okur,
 * `report.sentTo`'ya ekli mail gönderir, `sent_at`'i günceller. Rapor
 * silinmişse sessizce atlanır (alert bildirimlerindeki `findById` deseniyle
 * tutarlı).
 */
@Injectable()
export class ReportNotifyService implements ReportNotifier {
  private readonly logger = new Logger(ReportNotifyService.name);

  constructor(
    @InjectTenantRepository(Report)
    private readonly reports: TenantRepository<Report>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async notifyReport(reportId: string): Promise<void> {
    const report = await this.reports.findOneBy({ id: reportId });
    if (!report) {
      this.logger.warn(`rapor bulunamadı, atlandı: ${reportId}`);
      return;
    }
    if (report.status !== ReportStatus.Ready || !report.fileKey) {
      throw new ReportNotReadyError();
    }

    const pdf = await this.storage.get(report.fileKey);
    const filename = `${report.type}-${report.periodStart}-${report.periodEnd}.pdf`;
    await this.mail.send({
      to: report.sentTo,
      subject: `SEO raporu: ${report.periodStart} – ${report.periodEnd}`,
      html: `<p>${report.periodStart} – ${report.periodEnd} dönemine ait rapor ektedir.</p>`,
      text: `${report.periodStart} – ${report.periodEnd} dönemine ait rapor ektedir.`,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
    await this.reports.update({ id: reportId }, { sentAt: new Date() });
  }
}
