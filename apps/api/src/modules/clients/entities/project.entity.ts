import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Client } from './client.entity';

/** ARCHITECTURE §5.2: proje yaşam döngüsü. */
export enum ProjectStatus {
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

/** `domain`'in normalize edilmiş biçimde tutulduğunu DB seviyesinde de sabitler. */
export const PROJECT_DOMAIN_LOWER_CHECK = `"domain" = lower("domain")`;

/**
 * Tek domainli bir proje (ARCHITECTURE §5.2). `(org_id, domain)` unique'tir;
 * `domain` her zaman normalize edilmiş (protokolsüz, www'siz, lowercase) tutulur.
 */
@Entity('projects')
@Index('UQ_projects_org_id_domain', ['orgId', 'domain'], { unique: true })
@Index('IDX_projects_org_id_client_id', ['orgId', 'clientId'])
@Check('CHK_projects_domain_lower', PROJECT_DOMAIN_LOWER_CHECK)
export class Project extends TenantScopedEntity {
  @Column('uuid')
  clientId!: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: Client;

  @Column('text')
  name!: string;

  @Column('text')
  domain!: string;

  @Column('text', { nullable: true })
  countryCode!: string | null;

  @Column('text', { nullable: true })
  languageCode!: string | null;

  @Column('int', { nullable: true })
  dfsLocationCode!: number | null;

  @Column('text', { nullable: true })
  dfsLanguageCode!: string | null;

  @Column('text', { nullable: true })
  timezone!: string | null;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    enumName: 'project_status',
    default: ProjectStatus.Active,
  })
  status!: ProjectStatus;
}
