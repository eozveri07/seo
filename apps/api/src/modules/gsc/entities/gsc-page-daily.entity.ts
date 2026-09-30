import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * ARCHITECTURE §5.3: sayfa × cihaz × ülke günlük metrikleri. Aylık range
 * partition'lı (§6); TypeORM partition'lardan habersizdir. Sayfa toplamları
 * buradan okunur.
 */
@Entity('gsc_page_daily')
export class GscPageDaily {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn('uuid')
  projectId!: string;

  @PrimaryColumn('char', { length: 32 })
  pageHash!: string;

  @PrimaryColumn('varchar', { length: 10 })
  device!: string;

  @PrimaryColumn('varchar', { length: 3 })
  country!: string;

  @Column('uuid')
  orgId!: string;

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
