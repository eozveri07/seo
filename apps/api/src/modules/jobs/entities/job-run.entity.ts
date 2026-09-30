import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { JobTrigger } from '../../../infra/queue/queues';

export enum JobRunStatus {
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

/**
 * ARCHITECTURE §5.6: kuyruk job'larının kalıcı geçmişi. BullMQ tamamlanan
 * job'ları siler; panel "son senkron", "hata" gibi bilgileri buradan okur.
 * `type` kuyruk adıdır (`gsc-sync`, `gsc-backfill`, ...).
 */
@Entity('job_runs')
@Index('IDX_job_runs_org_id_project_id_created_at', [
  'orgId',
  'projectId',
  'createdAt',
])
@Index('IDX_job_runs_status_started_at', ['status', 'startedAt'])
export class JobRun extends TenantScopedEntity {
  @Column('uuid', { nullable: true })
  projectId!: string | null;

  @Column('varchar', { length: 50 })
  type!: string;

  @Column({
    type: 'enum',
    enum: JobRunStatus,
    enumName: 'job_run_status',
    default: JobRunStatus.Queued,
  })
  status!: JobRunStatus;

  @Column({
    type: 'enum',
    enum: JobTrigger,
    enumName: 'job_run_trigger',
  })
  trigger!: JobTrigger;

  @Column('text', { nullable: true })
  bullmqJobId!: string | null;

  @Column('timestamptz', { nullable: true })
  startedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  finishedAt!: Date | null;

  @Column('jsonb', { nullable: true })
  stats!: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  error!: string | null;
}
