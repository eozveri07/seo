import { Column, Entity, PrimaryColumn } from 'typeorm';

/** ARCHITECTURE §5.5 `rank_daily.source`. */
export enum RankSource {
  /** Standard queue (`task_post` → `tasks_ready` → `task_get`). */
  DfsStandard = 'dfs_standard',
  /** Anlık kontrol (`live/advanced`). */
  DfsLive = 'dfs_live',
}

/** `competitors_top` öğesi: ilk 10 organik sonuçtaki domain ve organik sırası. */
export interface RankCompetitor {
  domain: string;
  position: number;
}

/**
 * Keyword başına günlük rank sonucu (ARCHITECTURE §5.5). Aylık range
 * partition'lı (§6); TypeORM partition'lardan habersizdir. Yazma/okuma
 * `RankStore` ve `RankingsQueryService`'te raw SQL ile yapılır.
 * `position` organik sıradır (`rank_group`); depth içinde bulunmazsa null.
 */
@Entity('rank_daily')
export class RankDaily {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn('uuid')
  trackedKeywordId!: string;

  @Column('uuid')
  orgId!: string;

  @Column('uuid')
  projectId!: string;

  @Column('smallint', { nullable: true })
  position!: number | null;

  @Column('smallint', { nullable: true })
  rankAbsolute!: number | null;

  @Column('text', { nullable: true })
  url!: string | null;

  @Column('text', { array: true, default: '{}' })
  serpFeatures!: string[];

  @Column('jsonb', { default: () => "'[]'" })
  competitorsTop!: RankCompetitor[];

  @Column('timestamptz')
  checkedAt!: Date;

  @Column({ type: 'enum', enum: RankSource, enumName: 'rank_source' })
  source!: RankSource;
}
