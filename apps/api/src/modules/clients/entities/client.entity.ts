import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';

/** Bir ajans müşterisi (ARCHITECTURE §5.2). Bir ya da daha fazla projesi olur. */
@Entity('clients')
@Index('IDX_clients_org_id', ['orgId'])
export class Client extends TenantScopedEntity {
  @Column('text')
  name!: string;

  @Column('text', { array: true, default: '{}' })
  contactEmails!: string[];

  @Column('text', { nullable: true })
  notes!: string | null;

  @Column('jsonb', { default: {} })
  branding!: Record<string, unknown>;

  @Column('boolean', { default: true })
  isActive!: boolean;
}
