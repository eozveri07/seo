import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { ReportSchedule } from './entities/report-schedule.entity';
import {
  fireDateInTimezone,
  isScheduleDue,
  resolveSchedulePeriod,
} from './report-dispatch.logic';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportsService } from './reports.service';

export interface ReportDispatchStats {
  checked: number;
  dispatched: number;
}

/**
 * `report-dispatch` (T1.15, ARCHITECTURE §12): saatlik sistem job'u, tüm
 * org'lardaki aktif `report_schedules`'ı tarar. Zamanı gelen her schedule
 * için dönemi hesaplar, o dönem için rapor yoksa oluşturur ve `report`
 * job'unu kuyruğa ekler. Rapor oluşturma tenant kapsamlı olduğundan
 * schedule'ın org'u `runInTenant` ile geçici olarak CLS'e yazılır.
 */
@Injectable()
export class ReportDispatchService {
  private readonly logger = new Logger(ReportDispatchService.name);

  constructor(
    private readonly schedules: ReportSchedulesService,
    private readonly reports: ReportsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async dispatch(now: Date = new Date()): Promise<ReportDispatchStats> {
    const schedules = await this.schedules.listAllActive();
    let dispatched = 0;
    for (const schedule of schedules) {
      if (!isScheduleDue(schedule, now)) {
        continue;
      }
      const created = await this.dispatchOne(schedule, now);
      if (created) {
        dispatched += 1;
      }
    }
    this.logger.log(
      `report-dispatch: ${schedules.length} schedule tarandı, ${dispatched} rapor tetiklendi`,
    );
    return { checked: schedules.length, dispatched };
  }

  private async dispatchOne(
    schedule: ReportSchedule,
    now: Date,
  ): Promise<boolean> {
    const fireDate = fireDateInTimezone(schedule, now);
    const period = resolveSchedulePeriod(schedule.type, fireDate);
    try {
      return await runInTenant(this.cls, schedule.orgId, async () => {
        const result = await this.reports.createFromSchedule(schedule, period);
        return result.created;
      });
    } catch (error) {
      this.logger.error(
        `report-dispatch: schedule=${schedule.id} orgId=${schedule.orgId} tetiklenemedi`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
