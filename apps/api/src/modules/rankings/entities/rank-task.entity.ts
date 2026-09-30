import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';

/** ARCHITECTURE §5.5 `rank_tasks.status`. */
export enum RankTaskStatus {
  /** DataForSEO'ya gönderildi (ya da gönderilmek üzere ayrıldı). */
  Posted = 'posted',
  /** `tasks_ready`'de göründü, `rank-fetch` kuyrukta. */
  Ready = 'ready',
  Fetched = 'fetched',
  Failed = 'failed',
}

/**
 * Standard queue'ya gönderilen tek bir SERP task'ı (ARCHITECTURE §5.5, §9.3).
 * Unique `(tracked_keyword_id, check_date)`: aynı keyword için aynı gün tek
 * task açılır. Yazma `RankStore`'da raw SQL ile yapılır (claim/upsert);
 * entity şema ve okuma içindir.
 */
@Entity('rank_tasks')
@Index(
  'UQ_rank_tasks_tracked_keyword_id_check_date',
  ['trackedKeywordId', 'checkDate'],
  { unique: true },
)
@Index('IDX_rank_tasks_org_id_project_id_check_date', [
  'orgId',
  'projectId',
  'checkDate',
])
@Index('IDX_rank_tasks_provider_task_id', ['providerTaskId'])
export class RankTask extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @Column('uuid')
  trackedKeywordId!: string;

  @Column('date')
  checkDate!: string;

  @Column('text', { nullable: true })
  providerTaskId!: string | null;

  @Column({
    type: 'enum',
    enum: RankTaskStatus,
    enumName: 'rank_task_status',
  })
  status!: RankTaskStatus;

  @Column('timestamptz', { nullable: true })
  postedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  fetchedAt!: Date | null;

  @Column('smallint', { default: 0 })
  attempts!: number;

  @Column('text', { nullable: true })
  error!: string | null;
}
