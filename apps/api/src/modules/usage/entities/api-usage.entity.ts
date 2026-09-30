import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export enum ApiUsageProvider {
  DataForSeo = 'dataforseo',
  Gsc = 'gsc',
  Ga4 = 'ga4',
  Anthropic = 'anthropic',
}

/**
 * ARCHITECTURE §5.6: ücretli dış API çağrılarının maliyet kaydı (CLAUDE.md
 * kural 5). `org_id` sistem çağrılarında boştur, bu yüzden
 * `TenantScopedEntity`'den türemez. Yazan servis (`UsageService`) T1.7'de
 * gelir; tablo T1.5 migration'ında açılır.
 */
@Entity('api_usage')
@Index('IDX_api_usage_org_id_created_at', ['orgId', 'createdAt'])
@Index('IDX_api_usage_provider_created_at', ['provider', 'createdAt'])
export class ApiUsage {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column('uuid', { nullable: true })
  orgId!: string | null;

  @Column('uuid', { nullable: true })
  projectId!: string | null;

  @Column({
    type: 'enum',
    enum: ApiUsageProvider,
    enumName: 'api_usage_provider',
  })
  provider!: ApiUsageProvider;

  @Column('text')
  endpoint!: string;

  @Column('integer', { default: 1 })
  units!: number;

  /** numeric(12,6); pg string döner, hassasiyet kaybı olmasın diye string tutulur. */
  @Column('numeric', { precision: 12, scale: 6, default: 0 })
  cost!: string;

  @Column('uuid', { nullable: true })
  jobRunId!: string | null;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
