import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../database/entities/tenant-scoped.entity';

/**
 * ARCHITECTURE §5.1 / §13: üye, rol, bağlantı ve silme işlemlerinin kaydı.
 *
 * Kayıtlar denetim izi olduğu için `org_id` ve `user_id` bilerek FK değildir:
 * organizasyon ya da kullanıcı silindiğinde kayıt kalır.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_org_id_created_at', ['orgId', 'createdAt'])
export class AuditLog extends TenantScopedEntity {
  /** İşlemi yapan kullanıcı; sistem işlemlerinde null. */
  @Column('uuid', { nullable: true })
  userId!: string | null;

  /** Sabit bir işlem adı, ör. `member.role_changed`. */
  @Column('text')
  action!: string;

  @Column('text')
  entityType!: string;

  @Column('uuid', { nullable: true })
  entityId!: string | null;

  @Column('jsonb', { nullable: true })
  changes!: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  ip!: string | null;
}
