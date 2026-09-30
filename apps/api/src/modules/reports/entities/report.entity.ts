import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';

export enum ReportType {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Custom = 'custom',
}

export enum ReportStatus {
  Queued = 'queued',
  Rendering = 'rendering',
  Ready = 'ready',
  Failed = 'failed',
}

/**
 * Bir proje için oluşturulmuş rapor (ARCHITECTURE §5.7, §12). `report`
 * processor'ı `status`, `fileKey`, `fileSize` ve `generatedAt`'i günceller.
 */
@Entity('reports')
@Index('IDX_reports_org_id_project_id_period_start', [
  'orgId',
  'projectId',
  'periodStart',
])
export class Report extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @Column({ type: 'enum', enum: ReportType, enumName: 'report_type' })
  type!: ReportType;

  @Column('date')
  periodStart!: string;

  @Column('date')
  periodEnd!: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    enumName: 'report_status',
    default: ReportStatus.Queued,
  })
  status!: ReportStatus;

  @Column('text', { nullable: true })
  fileKey!: string | null;

  @Column('integer', { nullable: true })
  fileSize!: number | null;

  @Column('timestamptz', { nullable: true })
  generatedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  sentAt!: Date | null;

  @Column('text', { array: true, default: '{}' })
  sentTo!: string[];

  @Column('text', { nullable: true })
  error!: string | null;

  /** Rapor oluşturulurken elle girilen not (ARCHITECTURE §12); Faz 3'te AI taslağı. */
  @Column('text', { nullable: true })
  analystNote!: string | null;

  @Column('uuid', { nullable: true })
  createdBy!: string | null;
}
