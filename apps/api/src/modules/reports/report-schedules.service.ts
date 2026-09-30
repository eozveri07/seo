import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ReportScheduleNotFoundError } from './reports.errors';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportType } from './entities/report.entity';

export interface CreateReportScheduleInput {
  projectId: string;
  type: ReportType;
  cron: string;
  timezone: string;
  recipients: string[];
  isActive?: boolean;
}

export interface UpdateReportScheduleInput {
  type?: ReportType;
  cron?: string;
  timezone?: string;
  recipients?: string[];
  isActive?: boolean;
}

/** Proje başına rapor zamanlaması CRUD'u (ARCHITECTURE §5.7, §12). */
@Injectable()
export class ReportSchedulesService {
  constructor(
    @InjectTenantRepository(ReportSchedule)
    private readonly schedules: TenantRepository<ReportSchedule>,
    private readonly audit: AuditService,
    /** `ReportDispatchService` org kapsamı olmadan tüm schedule'ları tarar. */
    @InjectRepository(ReportSchedule)
    private readonly systemSchedules: Repository<ReportSchedule>,
  ) {}

  async list(projectId: string): Promise<ReportSchedule[]> {
    return this.schedules.findBy({ projectId });
  }

  async findOne(projectId: string, id: string): Promise<ReportSchedule> {
    const schedule = await this.schedules.findOneBy({ id, projectId });
    if (!schedule) {
      throw new ReportScheduleNotFoundError();
    }
    return schedule;
  }

  /** `ReportDispatchService`'in taradığı tüm aktif schedule'lar (tüm org'lar). */
  async listAllActive(): Promise<ReportSchedule[]> {
    return this.systemSchedules.findBy({ isActive: true });
  }

  async create(input: CreateReportScheduleInput): Promise<ReportSchedule> {
    const schedule = await this.schedules.save({
      projectId: input.projectId,
      type: input.type,
      cron: input.cron,
      timezone: input.timezone,
      recipients: input.recipients,
      isActive: input.isActive ?? true,
    });
    await this.audit.record({
      action: AuditAction.ReportScheduleCreated,
      entityType: 'report_schedule',
      entityId: schedule.id,
      changes: { projectId: schedule.projectId, type: schedule.type },
    });
    return schedule;
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateReportScheduleInput,
  ): Promise<ReportSchedule> {
    const schedule = await this.findOne(projectId, id);
    const patch: Partial<ReportSchedule> = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.cron !== undefined) patch.cron = input.cron;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.recipients !== undefined) patch.recipients = input.recipients;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length === 0) {
      return schedule;
    }
    await this.schedules.save({ ...schedule, ...patch });
    await this.audit.record({
      action: AuditAction.ReportScheduleUpdated,
      entityType: 'report_schedule',
      entityId: schedule.id,
      changes: patch,
    });
    return Object.assign(schedule, patch);
  }

  async delete(projectId: string, id: string): Promise<void> {
    const schedule = await this.findOne(projectId, id);
    await this.schedules.delete({ id: schedule.id });
    await this.audit.record({
      action: AuditAction.ReportScheduleDeleted,
      entityType: 'report_schedule',
      entityId: schedule.id,
      changes: { projectId },
    });
  }
}
