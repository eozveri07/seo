import { Column } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Tenant verisi taşıyan her entity bundan türer (CLAUDE.md kural 4) ve
 * TenantRepository üzerinden okunup yazılır.
 *
 * org_id için burada index yok: her alt entity kendi sorgularına uygun
 * `(org_id, ...)` bileşik index'ini tanımlar.
 */
export abstract class TenantScopedEntity extends BaseEntity {
  @Column('uuid')
  orgId!: string;
}
