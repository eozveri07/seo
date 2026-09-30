import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { OrgRole } from '../../common/tenancy/org-role';
import {
  Page,
  PaginationQueryDto,
  pageOffset,
} from '../../common/pagination/pagination-query.dto';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { TenantContextMissingError } from '../../common/tenancy/tenant.errors';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Membership } from './entities/membership.entity';
import { lockOrganization } from './lock-organization';
import { CachedMembership, MembershipCache } from './membership-cache';
import {
  InvalidClientScopeError,
  LastOwnerError,
  MemberNotFoundError,
  OwnerRoleRequiredError,
} from './organizations.errors';

export interface MemberRoleInput {
  role: OrgRole;
  clientId?: string | null;
}

export interface MemberView {
  membership: Membership;
  user: User | undefined;
}

export interface NewMembership {
  orgId: string;
  userId: string;
  role: OrgRole;
  clientId: string | null;
  invitedBy: string | null;
}

/**
 * Üyelikler. Org kapsamlı işlemler TenantRepository ile CLS'teki orgId'ye
 * bağlıdır. `resolve` TenantGuard içindir: CLS'te henüz orgId yokken çağrılır,
 * bu yüzden ham repository'yi açık `org_id` şartıyla kullanır.
 */
@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly allMemberships: Repository<Membership>,
    @InjectTenantRepository(Membership)
    private readonly memberships: TenantRepository<Membership>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: MembershipCache,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Kullanıcının org'daki rolü; üye değilse undefined. Sonuç 60 sn cache'lenir. */
  async resolve(
    orgId: string,
    userId: string,
  ): Promise<CachedMembership | undefined> {
    const cached = await this.cache.get(orgId, userId);
    if (cached) {
      return cached;
    }

    const membership = await this.allMemberships.findOneBy({ orgId, userId });
    if (!membership) {
      return undefined;
    }
    const resolved = { role: membership.role, clientId: membership.clientId };
    await this.cache.set(orgId, userId, resolved);
    return resolved;
  }

  async list(query: PaginationQueryDto): Promise<Page<MemberView>> {
    const [memberships, total] = await this.memberships.findAndCount({
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: pageOffset(query),
      take: query.limit,
    });
    const users = await this.usersService.findByIds(
      memberships.map((membership) => membership.userId),
    );
    const usersById = new Map(users.map((user) => [user.id, user]));
    return {
      items: memberships.map((membership) => ({
        membership,
        user: usersById.get(membership.userId),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Aktif org'da bu kullanıcının üyeliği var mı. */
  isMember(userId: string): Promise<boolean> {
    return this.memberships.existsBy({ userId });
  }

  /**
   * Rol değiştirir. owner rolünü yalnız owner verir ya da alır; son owner'ın
   * rolü düşürülemez. Cache transaction commit edildikten sonra silinir.
   */
  async changeRole(
    targetUserId: string,
    input: MemberRoleInput,
    actor: TenantContext,
  ): Promise<Membership> {
    const clientId = normalizeClientScope(input.role, input.clientId);
    const updated = await this.dataSource.transaction(async (manager) => {
      await lockOrganization(manager, actor.orgId);
      const repository = this.memberships.withManager(manager);
      const target = await repository.findOneBy({ userId: targetUserId });
      if (!target) {
        throw new MemberNotFoundError();
      }
      const touchesOwner =
        target.role === OrgRole.Owner || input.role === OrgRole.Owner;
      if (touchesOwner && actor.role !== OrgRole.Owner) {
        throw new OwnerRoleRequiredError();
      }
      if (target.role === OrgRole.Owner && input.role !== OrgRole.Owner) {
        await this.assertNotLastOwner(repository);
      }

      await repository.update(
        { id: target.id },
        { role: input.role, clientId },
      );
      await this.audit.record(
        {
          action: AuditAction.MemberRoleChanged,
          entityType: 'membership',
          entityId: target.id,
          changes: {
            userId: target.userId,
            role: { from: target.role, to: input.role },
            clientId: { from: target.clientId, to: clientId },
          },
        },
        manager,
      );
      return { ...target, role: input.role, clientId } as Membership;
    });

    await this.cache.invalidate(actor.orgId, [targetUserId]);
    return updated;
  }

  /** Üyeyi çıkarır; son owner çıkarılamaz. */
  async remove(targetUserId: string, actor: TenantContext): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockOrganization(manager, actor.orgId);
      const repository = this.memberships.withManager(manager);
      const target = await repository.findOneBy({ userId: targetUserId });
      if (!target) {
        throw new MemberNotFoundError();
      }
      if (target.role === OrgRole.Owner) {
        await this.assertNotLastOwner(repository);
      }

      await repository.delete({ id: target.id });
      await this.audit.record(
        {
          action: AuditAction.MemberRemoved,
          entityType: 'membership',
          entityId: target.id,
          changes: {
            userId: target.userId,
            role: target.role,
            clientId: target.clientId,
          },
        },
        manager,
      );
    });

    await this.cache.invalidate(actor.orgId, [targetUserId]);
  }

  /**
   * Yeni üyelik ekler (org oluşturma, davet kabulü). `orgId` CLS'teki aktif
   * organizasyonla aynı olmalıdır; çağıran `runInTenant` ile kurar.
   */
  async add(input: NewMembership, manager: EntityManager): Promise<Membership> {
    if (this.cls.get('orgId') !== input.orgId) {
      throw new TenantContextMissingError();
    }
    const membership = await this.memberships.withManager(manager).save({
      orgId: input.orgId,
      userId: input.userId,
      role: input.role,
      clientId: normalizeClientScope(input.role, input.clientId),
      invitedBy: input.invitedBy,
    });
    await this.audit.record(
      {
        action: AuditAction.MemberAdded,
        entityType: 'membership',
        entityId: membership.id,
        changes: {
          userId: membership.userId,
          role: membership.role,
          clientId: membership.clientId,
        },
      },
      manager,
    );
    return membership;
  }

  /** Org silinmeden önce: tüm üyelerin cache'ini silmek için kullanıcı id'leri. */
  async memberUserIds(manager?: EntityManager): Promise<string[]> {
    const repository = manager
      ? this.memberships.withManager(manager)
      : this.memberships;
    const memberships = await repository.find({ select: { userId: true } });
    return memberships.map((membership) => membership.userId);
  }

  invalidateCache(orgId: string, userIds: string[]): Promise<void> {
    return this.cache.invalidate(orgId, userIds);
  }

  private async assertNotLastOwner(
    repository: TenantRepository<Membership>,
  ): Promise<void> {
    const owners = await repository.countBy({ role: OrgRole.Owner });
    if (owners <= 1) {
      throw new LastOwnerError();
    }
  }
}

/** client_viewer'da clientId zorunlu; diğer rollerde verilemez (§4.2). */
export function normalizeClientScope(
  role: OrgRole,
  clientId: string | null | undefined,
): string | null {
  if (role === OrgRole.ClientViewer) {
    if (!clientId) {
      throw new InvalidClientScopeError();
    }
    return clientId;
  }
  if (clientId) {
    throw new InvalidClientScopeError();
  }
  return null;
}
