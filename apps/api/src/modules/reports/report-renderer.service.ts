import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { chromium } from 'playwright';
import { EnvironmentVariables } from '../../config/environment-variables';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { reportNotifyJobId } from '../../infra/queue/job-ids';
import { JobTrigger, NotifyJobData, QueueName } from '../../infra/queue/queues';
import { STORAGE_SERVICE } from '../../infra/storage/storage.interface';
import type { StorageService } from '../../infra/storage/storage.interface';
import { Report, ReportStatus } from './entities/report.entity';
import { ReportTokenService } from './report-token.service';
import { ReportNotFoundError } from './reports.errors';

/** Print sayfasının `data-report-ready="true"` koymasını bekleme süresi. */
export const REPORT_READY_TIMEOUT_MS = 20_000;
const DEFAULT_PANEL_URL = 'http://localhost:5173';
const MAX_ERROR_LENGTH = 2000;

export interface ReportRenderResult {
  fileKey: string;
  fileSize: number;
}

/**
 * `report` job'u (T1.15, ARCHITECTURE §12): Playwright (chromium) panelin
 * `/print/reports/:id` sayfasını rapor token'ıyla açar, `data-report-ready`
 * işaretini bekler, PDF'i üretip `StorageService`'e yazar ve `reports`
 * satırını günceller. Alıcı varsa (`sentTo`) `notify` job'u eklenir.
 */
@Injectable()
export class ReportRendererService {
  private readonly logger = new Logger(ReportRendererService.name);

  constructor(
    @InjectTenantRepository(Report)
    private readonly reports: TenantRepository<Report>,
    private readonly reportTokenService: ReportTokenService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @InjectQueue(QueueName.Notify)
    private readonly notifyQueue: Queue<NotifyJobData>,
  ) {}

  async render(reportId: string): Promise<ReportRenderResult> {
    const report = await this.reports.findOneBy({ id: reportId });
    if (!report) {
      throw new ReportNotFoundError();
    }
    await this.reports.update(
      { id: reportId },
      { status: ReportStatus.Rendering, error: null },
    );

    try {
      const pdf = await this.renderPdf(report);
      const fileKey = `reports/${report.orgId}/${report.projectId}/${reportId}.pdf`;
      await this.storage.put(fileKey, pdf);
      await this.reports.update(
        { id: reportId },
        {
          status: ReportStatus.Ready,
          fileKey,
          fileSize: pdf.length,
          generatedAt: new Date(),
          error: null,
        },
      );
      await this.enqueueNotifyIfNeeded(report);
      return { fileKey, fileSize: pdf.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.reports.update(
        { id: reportId },
        {
          status: ReportStatus.Failed,
          error: message.slice(0, MAX_ERROR_LENGTH),
        },
      );
      throw error;
    }
  }

  private async renderPdf(report: Report): Promise<Buffer> {
    const token = this.reportTokenService.sign(report.id, report.orgId);
    const panelUrl =
      this.configService.get('PANEL_URL', { infer: true }) ?? DEFAULT_PANEL_URL;
    const url = `${panelUrl.replace(/\/$/, '')}/print/reports/${report.id}?token=${token}`;

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-report-ready="true"]', {
        timeout: REPORT_READY_TIMEOUT_MS,
      });
      return await page.pdf({ format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  }

  private async enqueueNotifyIfNeeded(report: Report): Promise<void> {
    if (report.sentTo.length === 0) {
      return;
    }
    await this.notifyQueue.add(
      QueueName.Notify,
      {
        orgId: report.orgId,
        projectId: report.projectId,
        reportId: report.id,
        trigger: JobTrigger.System,
      },
      { jobId: reportNotifyJobId(report.id) },
    );
    this.logger.log(`report ${report.id}: notify job eklendi`);
  }
}
