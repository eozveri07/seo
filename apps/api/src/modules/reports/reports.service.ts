import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Readable } from 'node:stream';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { reportJobId, reportScheduleJobId } from '../../infra/queue/job-ids';
import { JobTrigger, QueueName, ReportJobData } from '../../infra/queue/queues';
import { STORAGE_SERVICE } from '../../infra/storage/storage.interface';
import type { StorageService } from '../../infra/storage/storage.interface';
import { JobRunsService } from '../jobs/job-runs.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportQueryDto } from './dto/list-report-query.dto';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Report, ReportStatus } from './entities/report.entity';
import {
  InvalidReportPeriodError,
  ReportFileNotFoundError,
  ReportNotFoundError,
  ReportNotReadyError,
} from './reports.errors';

export interface CreateReportInput {
  projectId: string;
  type: CreateReportDto['type'];
  periodStart: string;
  periodEnd: string;
  analystNote?: string;
  createdBy: string;
}

export interface ReportDownload {
  stream: Readable;
  filename: string;
}

/** Rapor CRUD'u ve PDF üretimini tetikleme (ARCHITECTURE §5.7, §12). */
@Injectable()
export class ReportsService {
  constructor(
    @InjectTenantRepository(Report)
    private readonly reports: TenantRepository<Report>,
    private readonly jobRuns: JobRunsService,
    @InjectQueue(QueueName.Report)
    private readonly reportQueue: Queue<ReportJobData>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(
    projectId: string,
    query: ListReportQueryDto,
  ): Promise<Page<Report>> {
    const qb = this.reports
      .createQueryBuilder('report')
      .andWhere('report.project_id = :projectId', { projectId })
      .orderBy('report.period_start', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.type) {
      qb.andWhere('report.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('report.status = :status', { status: query.status });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(projectId: string, id: string): Promise<Report> {
    const report = await this.reports.findOneBy({ id, projectId });
    if (!report) {
      throw new ReportNotFoundError();
    }
    return report;
  }

  /**
   * `POST /projects/:id/reports` (CLAUDE.md kural 6): `job_runs` kaydı
   * `queued` açılır, `report` job'u eklenir ve kaydın id'si döner.
   */
  async create(orgId: string, input: CreateReportInput): Promise<string> {
    if (input.periodEnd < input.periodStart) {
      throw new InvalidReportPeriodError(
        "'periodEnd', 'periodStart'tan önce olamaz.",
      );
    }

    const report = await this.reports.save({
      projectId: input.projectId,
      type: input.type,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: ReportStatus.Queued,
      analystNote: input.analystNote ?? null,
      createdBy: input.createdBy,
    });

    const run = await this.jobRuns.createQueued({
      type: QueueName.Report,
      projectId: input.projectId,
      trigger: JobTrigger.Manual,
    });
    const jobId = reportJobId(report.id);
    try {
      await this.reportQueue.add(
        QueueName.Report,
        {
          orgId,
          projectId: input.projectId,
          reportId: report.id,
          runId: run.id,
          trigger: JobTrigger.Manual,
        },
        { jobId },
      );
    } catch (error) {
      await this.jobRuns.fail(
        {
          queueName: QueueName.Report,
          jobId,
          orgId,
          projectId: input.projectId,
          runId: run.id,
          trigger: JobTrigger.Manual,
        },
        error,
        true,
      );
      throw error;
    }
    await this.jobRuns.attachBullmqJob(run.id, jobId);
    return run.id;
  }

  /**
   * `report-dispatch`'in (ARCHITECTURE §12) bir schedule + dönem için
   * çağırdığı yol: aynı `(projectId, type, periodStart, periodEnd)` için
   * zaten bir rapor varsa (idempotency) yeni bir tane açmaz. Çağıran
   * `runInTenant` ile schedule'ın org'unu CLS'e yazmış olmalı.
   */
  async createFromSchedule(
    schedule: ReportSchedule,
    period: { periodStart: string; periodEnd: string },
  ): Promise<{ created: boolean; reportId?: string }> {
    const existing = await this.reports.findOneBy({
      projectId: schedule.projectId,
      type: schedule.type,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
    if (existing) {
      return { created: false, reportId: existing.id };
    }

    const report = await this.reports.save({
      projectId: schedule.projectId,
      type: schedule.type,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: ReportStatus.Queued,
      sentTo: schedule.recipients,
      analystNote: null,
      createdBy: null,
    });
    const jobId = reportScheduleJobId(schedule.id, period.periodStart);
    await this.reportQueue.add(
      QueueName.Report,
      {
        orgId: schedule.orgId,
        projectId: schedule.projectId,
        reportId: report.id,
        trigger: JobTrigger.Schedule,
      },
      { jobId },
    );
    return { created: true, reportId: report.id };
  }

  async download(projectId: string, id: string): Promise<ReportDownload> {
    const report = await this.findOne(projectId, id);
    if (report.status !== ReportStatus.Ready || !report.fileKey) {
      throw new ReportNotReadyError();
    }
    try {
      const stream = await this.storage.getStream(report.fileKey);
      return {
        stream,
        filename: `${report.type}-${report.periodStart}-${report.periodEnd}.pdf`,
      };
    } catch {
      throw new ReportFileNotFoundError();
    }
  }
}
