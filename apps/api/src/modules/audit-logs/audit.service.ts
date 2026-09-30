import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditLog } from './audit-log.entity';

/** Kayıtlı işlem adları; rapor ve filtreler bu sabitlere dayanır. */
export enum AuditAction {
  OrganizationCreated = 'organization.created',
  OrganizationUpdated = 'organization.updated',
  OrganizationDeleted = 'organization.deleted',
  MemberAdded = 'member.added',
  MemberRoleChanged = 'member.role_changed',
  MemberRemoved = 'member.removed',
  InvitationCreated = 'invitation.created',
  InvitationRevoked = 'invitation.revoked',
  ClientCreated = 'client.created',
  ClientDeleted = 'client.deleted',
  ProjectCreated = 'project.created',
  ProjectDeleted = 'project.deleted',
  ConnectionCreated = 'connection.created',
  ConnectionVerified = 'connection.verified',
  ConnectionDeleted = 'connection.deleted',
  KeywordGroupCreated = 'keyword_group.created',
  KeywordGroupDeleted = 'keyword_group.deleted',
  KeywordCreated = 'keyword.created',
  KeywordDeleted = 'keyword.deleted',
  KeywordsBulkAdded = 'keywords.bulk_added',
}

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  /** Verilmezse CLS'teki oturum kullanıcısı. */
  userId?: string | null;
}

/**
 * Kritik işlemleri `audit_logs`'a yazar. Organizasyon CLS'ten gelir
 * (TenantRepository); kullanıcı ve IP de CLS'ten okunur. `manager` verilirse
 * kayıt çağıranın transaction'ıyla birlikte yazılır ya da geri alınır.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectTenantRepository(AuditLog)
    private readonly logs: TenantRepository<AuditLog>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repository = manager ? this.logs.withManager(manager) : this.logs;
    const log: Omit<
      AuditLog,
      'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'ensureId'
    > = {
      userId: entry.userId ?? this.cls.get('userId') ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      changes: entry.changes ?? null,
      ip: this.cls.get('ip') ?? null,
    };
    // jsonb kolonu TypeORM'un derin partial tipine uymuyor; değer düz JSON.
    await repository.insert(log as QueryDeepPartialEntity<AuditLog>);
  }
}
