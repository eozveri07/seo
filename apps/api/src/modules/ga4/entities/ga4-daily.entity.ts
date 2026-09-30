import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * ARCHITECTURE §5.4: sayfa (landing page) × kanal grubu günlük GA4
 * metrikleri. Aylık range partition'lı (§6); TypeORM partition'lardan
 * habersizdir. Yazma/okuma `Ga4Store` ve `Ga4QueryService`'te raw SQL ile
 * yapılır.
 */
@Entity('ga4_daily')
export class Ga4Daily {
  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn('uuid')
  projectId!: string;

  @PrimaryColumn('char', { length: 32 })
  landingPageHash!: string;

  @PrimaryColumn('varchar', { length: 50 })
  channelGroup!: string;

  @Column('uuid')
  orgId!: string;

  @Column('text')
  landingPage!: string;

  @Column('integer')
  sessions!: number;

  @Column('integer')
  engagedSessions!: number;

  @Column('integer')
  keyEvents!: number;

  @Column('numeric', { precision: 14, scale: 2 })
  totalRevenue!: string;
}
