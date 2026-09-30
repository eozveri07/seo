import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Keyword tablosunun hızlı görünümü (ARCHITECTURE §5.5, §10): keyword başına
 * son pozisyon, değişimler, en iyi pozisyon ve son 30 günün sparkline'ı.
 * `summary` job'u (T1.10) `rank_daily`'den hesaplayıp yazar.
 */
@Entity('keyword_rank_latest')
@Index('IDX_keyword_rank_latest_org_id_project_id', ['orgId', 'projectId'])
export class KeywordRankLatest {
  @PrimaryColumn('uuid')
  trackedKeywordId!: string;

  @Column('uuid')
  orgId!: string;

  @Column('uuid')
  projectId!: string;

  @Column('smallint', { nullable: true })
  position!: number | null;

  @Column('text', { nullable: true })
  url!: string | null;

  @Column('smallint', { nullable: true })
  previousPosition!: number | null;

  @Column('smallint', { name: 'change_1d', nullable: true })
  change1d!: number | null;

  @Column('smallint', { name: 'change_7d', nullable: true })
  change7d!: number | null;

  @Column('smallint', { name: 'change_30d', nullable: true })
  change30d!: number | null;

  @Column('smallint', { nullable: true })
  bestPosition!: number | null;

  /** Son 30 gün, eskiden yeniye; depth dışı günler null. */
  @Column('smallint', { array: true, default: '{}' })
  sparkline!: (number | null)[];

  @Column('timestamptz', { default: () => 'now()' })
  updatedAt!: Date;
}
