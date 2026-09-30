import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * ARCHITECTURE §5.3: sorgu × sayfa × ülke × cihaz günlük metrikleri. Aylık
 * range partition'lı (§6). Sorgu detayları buradan okunur; toplamı site
 * toplamından düşüktür (GSC anonim sorguları gizler).
 */
@Entity('gsc_daily')
export class GscDaily {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn('uuid')
  projectId!: string;

  @PrimaryColumn('char', { length: 32 })
  queryHash!: string;

  @PrimaryColumn('char', { length: 32 })
  pageHash!: string;

  @PrimaryColumn('varchar', { length: 3 })
  country!: string;

  @PrimaryColumn('varchar', { length: 10 })
  device!: string;

  @Column('uuid')
  orgId!: string;

  @Column('text')
  query!: string;

  @Column('text')
  page!: string;

  @Column('integer')
  clicks!: number;

  @Column('integer')
  impressions!: number;

  @Column('real')
  ctr!: number;

  @Column('real')
  position!: number;
}
