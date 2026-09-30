import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Proje günlük özeti (ARCHITECTURE §5.6, §10). `summary` job'u
 * `gsc_site_daily`, `ga4_daily` ve `rank_daily`'den hesaplayıp upsert eder.
 * PK `(project_id, date)`; aynı gün yeniden hesaplanırsa son hali kalır
 * (idempotent).
 */
@Entity('project_daily_summary')
@Index('IDX_project_daily_summary_org_id_date', ['orgId', 'date'])
export class ProjectDailySummary {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn('uuid')
  projectId!: string;

  @Column('uuid')
  orgId!: string;

  @Column('float8')
  gscClicks!: number;

  @Column('float8')
  gscImpressions!: number;

  @Column('float8')
  gscCtr!: number;

  @Column('float8')
  gscPosition!: number;

  @Column('float8')
  organicSessions!: number;

  @Column('float8')
  organicKeyEvents!: number;

  @Column('int')
  kwTracked!: number;

  @Column('int')
  kwTop3!: number;

  @Column('int')
  kwTop10!: number;

  @Column('int')
  kwTop20!: number;

  @Column('int')
  kwTop100!: number;

  @Column('float8', { nullable: true })
  kwAvgPosition!: number | null;

  @Column('numeric', { precision: 5, scale: 2 })
  visibilityScore!: string;

  @Column('timestamptz', { default: () => 'now()' })
  updatedAt!: Date;
}
