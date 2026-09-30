import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * ARCHITECTURE §5.3: `dimensions: [date]` ile çekilen site toplamı.
 * Anonimleştirilmiş sorgular dahil doğru toplamı tutar; dashboard toplamları
 * yalnız buradan okunur. Yazma/okuma `GscStore` ve `GscQueryService`'te
 * raw SQL ile yapılır (upsert ve toplama sorguları).
 */
@Entity('gsc_site_daily')
@Index('IDX_gsc_site_daily_org_id_project_id', ['orgId', 'projectId'])
export class GscSiteDaily {
  @PrimaryColumn('uuid')
  projectId!: string;

  @PrimaryColumn('date')
  date!: string;

  @Column('uuid')
  orgId!: string;

  @Column('integer')
  clicks!: number;

  @Column('integer')
  impressions!: number;

  @Column('real')
  ctr!: number;

  @Column('real')
  position!: number;
}
