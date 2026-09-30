import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  getTenantRepositoryToken,
  provideTenantRepository,
} from '../../common/tenancy/tenant-repository.provider';
import { MailModule } from '../../infra/mail/mail.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { JobsModule } from '../jobs/jobs.module';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Report } from './entities/report.entity';
import { ReportDataService } from './report-data.service';
import { REPORT_NOTIFIER } from './report-notifier';
import { ReportNotifyService } from './report-notify.service';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportTokenService } from './report-token.service';
import { ReportsService } from './reports.service';

/**
 * API (CRUD, print verisi) ve worker'ın (`report`/`report-dispatch`
 * processor'ları) ortak kullandığı rapor servisleri. HTTP katmanı içermez.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportSchedule]),
    QueueModule,
    StorageModule,
    MailModule,
    JobsModule,
    AuditLogsModule,
  ],
  providers: [
    provideTenantRepository(Report),
    provideTenantRepository(ReportSchedule),
    ReportTokenService,
    ReportDataService,
    ReportsService,
    ReportSchedulesService,
    ReportNotifyService,
    { provide: REPORT_NOTIFIER, useExisting: ReportNotifyService },
  ],
  exports: [
    getTenantRepositoryToken(Report),
    ReportTokenService,
    ReportDataService,
    ReportsService,
    ReportSchedulesService,
    REPORT_NOTIFIER,
  ],
})
export class ReportsSharedModule {}
