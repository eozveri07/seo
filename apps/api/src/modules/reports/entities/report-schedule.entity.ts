import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { ReportType } from './report.entity';

/**
 * Otomatik rapor zamanlaması (ARCHITECTURE §5.7, §12). `report-dispatch`
 * Job Scheduler'ı `cron`'u `timezone`'a göre değerlendirir.
 */
@Entity('report_schedules')
@Index('IDX_report_schedules_org_id_project_id', ['orgId', 'projectId'])
export class ReportSchedule extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  /**
   * DB'de `reports.type` ile aynı Postgres enum'u (`report_type`) kullanır,
   * ama TypeORM'da iki entity aynı `enumName`'i paylaşınca metadata
   * builder'ı tıkanıyor (senkron değil, migration'lar kullanılıyor; bu
   * yüzden farklı bir `enumName` vermek DB şemasını etkilemez).
   */
  @Column({ type: 'enum', enum: ReportType, enumName: 'report_schedule_type' })
  type!: ReportType;

  /** Standart 5 alanlı cron ifadesi (dk saat gün ay haftagünü). */
  @Column('text')
  cron!: string;

  /** IANA saat dilimi, ör. `Europe/Istanbul`. */
  @Column('text')
  timezone!: string;

  @Column('text', { array: true, default: '{}' })
  recipients!: string[];

  @Column('boolean', { default: true })
  isActive!: boolean;
}
