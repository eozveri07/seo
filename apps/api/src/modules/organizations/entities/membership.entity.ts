import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { OrgRole } from '../../../common/tenancy/org-role';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/user.entity';
import { Organization } from './organization.entity';

/** client_viewer'da client_id zorunlu, diğer rollerde boş (ARCHITECTURE §4.2). */
export const CLIENT_SCOPE_CHECK = `("role" = 'client_viewer') = ("client_id" IS NOT NULL)`;

/**
 * Kullanıcının bir organizasyondaki rolü. `(org_id, user_id)` unique'tir ve
 * org_id ile başlayan index görevini de görür.
 *
 * İlişkiler sadece FK kısıtları için tanımlıdır, yüklenmez.
 */
@Entity('memberships')
@Index('UQ_memberships_org_id_user_id', ['orgId', 'userId'], { unique: true })
@Index('IDX_memberships_user_id', ['userId'])
@Check('CHK_memberships_client_scope', CLIENT_SCOPE_CHECK)
export class Membership extends TenantScopedEntity {
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  organization?: Organization;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: OrgRole, enumName: 'org_role' })
  role!: OrgRole;

  @Column('uuid', { nullable: true })
  clientId!: string | null;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column('uuid', { nullable: true })
  invitedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invited_by' })
  inviter?: User | null;
}
