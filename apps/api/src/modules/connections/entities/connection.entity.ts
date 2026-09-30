import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Project } from '../../clients/entities/project.entity';

/** ARCHITECTURE §5.2: bağlantı tipi. */
export enum ConnectionType {
  Gsc = 'gsc',
  Ga4 = 'ga4',
}

export enum ConnectionAuthType {
  ServiceAccount = 'service_account',
  OAuth = 'oauth',
}

export enum ConnectionStatus {
  Pending = 'pending',
  Active = 'active',
  Error = 'error',
  Revoked = 'revoked',
}

export enum ConnectionBackfillStatus {
  Pending = 'pending',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}

export interface ConnectionBackfillProgress {
  from?: string;
  to?: string;
  done?: number;
  total?: number;
}

/**
 * Proje başına GSC/GA4 bağlantısı (ARCHITECTURE §5.2, §9.1, §9.2).
 * `(project_id, type)` unique'tir. `credentials_encrypted` yalnız
 * `auth_type = oauth` olduğunda dolu olur (Faz 1'de her zaman
 * `service_account`, bu yüzden Faz 1'de her zaman boş); `CryptoService` ile
 * şifreli tutulur, düz metin asla log'a ya da response'a yazılmaz.
 */
@Entity('connections')
@Index('UQ_connections_project_id_type', ['projectId', 'type'], {
  unique: true,
})
@Index('IDX_connections_org_id_project_id', ['orgId', 'projectId'])
@Check(
  'CHK_connections_credentials_service_account_null',
  `"auth_type" <> 'service_account' OR "credentials_encrypted" IS NULL`,
)
export class Connection extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'enum', enum: ConnectionType, enumName: 'connection_type' })
  type!: ConnectionType;

  /** GSC: `sc-domain:example.com` ya da `https://example.com/`. GA4: `properties/123456789`. */
  @Column('text')
  externalId!: string;

  @Column({
    type: 'enum',
    enum: ConnectionAuthType,
    enumName: 'connection_auth_type',
    default: ConnectionAuthType.ServiceAccount,
  })
  authType!: ConnectionAuthType;

  @Column('text', { nullable: true })
  credentialsEncrypted!: string | null;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    enumName: 'connection_status',
    default: ConnectionStatus.Pending,
  })
  status!: ConnectionStatus;

  @Column('timestamptz', { nullable: true })
  lastVerifiedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  lastSyncedAt!: Date | null;

  @Column('text', { nullable: true })
  lastError!: string | null;

  @Column({
    type: 'enum',
    enum: ConnectionBackfillStatus,
    enumName: 'connection_backfill_status',
    default: ConnectionBackfillStatus.Pending,
  })
  backfillStatus!: ConnectionBackfillStatus;

  @Column('jsonb', { default: {} })
  backfillProgress!: ConnectionBackfillProgress;
}
