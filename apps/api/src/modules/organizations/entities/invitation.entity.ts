import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { OrgRole } from '../../../common/tenancy/org-role';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { User } from '../../users/user.entity';
import { CLIENT_SCOPE_CHECK } from './membership.entity';
import { Organization } from './organization.entity';

/**
 * Organizasyona davet. Token'ın kendisi değil SHA-256 hash'i tutulur; kabul
 * edilince `accepted_at` dolar ve token bir daha kullanılamaz.
 */
@Entity('invitations')
@Index('IDX_invitations_org_id_email', ['orgId', 'email'])
@Check('CHK_invitations_client_scope', CLIENT_SCOPE_CHECK)
@Check('CHK_invitations_email_lower', `"email" = lower("email")`)
export class Invitation extends TenantScopedEntity {
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  organization?: Organization;

  @Column('text')
  email!: string;

  @Column({ type: 'enum', enum: OrgRole, enumName: 'org_role' })
  role!: OrgRole;

  @Column('uuid', { nullable: true })
  clientId!: string | null;

  /** Token'ın SHA-256 hash'i (hex). Loglanmaz, response'a konmaz. */
  @Index('UQ_invitations_token_hash', { unique: true })
  @Column('text', { select: false })
  tokenHash!: string;

  @Column('timestamptz')
  expiresAt!: Date;

  @Column('timestamptz', { nullable: true })
  acceptedAt!: Date | null;

  @Column('uuid', { nullable: true })
  invitedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invited_by' })
  inviter?: User | null;
}
