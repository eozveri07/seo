import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** `settings` içeriği (ARCHITECTURE §5.1). Tüm alanlar isteğe bağlı. */
export interface OrganizationSettings {
  /** IANA saat dilimi, ör. `Europe/Istanbul`. */
  timezone?: string;
  /** Varsayılan dil, ör. `tr`. */
  defaultLanguage?: string;
  /** Rapor markalaması. */
  reportBranding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
}

/**
 * Tenant'ın kendisi; `id` tenant tablolarındaki `org_id`'dir. TenantScopedEntity
 * değildir: kullanıcı üye olduğu organizasyonları X-Org-Id seçmeden listeler.
 * Org kapsamlı erişim her zaman CLS'teki orgId ile `id` üzerinden yapılır.
 */
@Entity('organizations')
export class Organization extends BaseEntity {
  @Column('text')
  name!: string;

  @Index('UQ_organizations_slug', { unique: true })
  @Column('text')
  slug!: string;

  @Column('jsonb', { default: () => "'{}'" })
  settings!: OrganizationSettings;
}
