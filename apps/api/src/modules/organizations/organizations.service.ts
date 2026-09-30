import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { randomBytes } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  Page,
  PaginationQueryDto,
  pageOffset,
} from '../../common/pagination/pagination-query.dto';
import { OrgRole } from '../../common/tenancy/org-role';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { TenantContextMissingError } from '../../common/tenancy/tenant.errors';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { Membership } from './entities/membership.entity';
import {
  Organization,
  OrganizationSettings,
} from './entities/organization.entity';
import { lockOrganization } from './lock-organization';
import { MembershipsService } from './memberships.service';
import { OrganizationSlugTakenError } from './organizations.errors';
import { slugify } from './slug';

const SLUG_UNIQUE_CONSTRAINT = 'UQ_organizations_slug';
const SLUG_SUFFIX_BYTES = 3;

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  settings?: OrganizationSettings;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  settings?: OrganizationSettings;
}

export interface UserOrganization {
  organization: Organization;
  role: OrgRole;
  clientId: string | null;
}

/**
 * Organizasyonlar. Org kapsamlı işlemler (`getCurrent`, `update`, `delete`)
 * org'u yalnız CLS'teki orgId'den alır; çağıranın verdiği bir id kullanılmaz.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly memberships: MembershipsService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Organizasyonu oluşturur; oluşturan kullanıcı owner olur. */
  async create(
    input: CreateOrganizationInput,
    userId: string,
  ): Promise<Organization> {
    const explicitSlug = input.slug !== undefined;
    const baseSlug = input.slug ?? slugify(input.name);

    // Slug açıkça verilmediyse çakışmada kısa rastgele bir ek denenir.
    for (let attempt = 0; ; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
      try {
        return await this.insertWithOwner(input, slug, userId);
      } catch (error) {
        if (!isSlugConflict(error)) {
          throw error;
        }
        if (explicitSlug || attempt >= 2) {
          throw new OrganizationSlugTakenError();
        }
      }
    }
  }

  /** Kullanıcının üye olduğu organizasyonlar ve oradaki rolü. */
  async listForUser(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Page<UserOrganization>> {
    // Tenant seçilmeden çalışır: kapsam kullanıcının kendi üyelikleridir.
    const [organizations, total] = await this.organizations
      .createQueryBuilder('organization')
      .innerJoinAndMapOne(
        'organization.membership',
        Membership,
        'membership',
        'membership.org_id = organization.id AND membership.user_id = :userId',
        { userId },
      )
      .orderBy('organization.name', 'ASC')
      .addOrderBy('organization.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit)
      .getManyAndCount();

    return {
      items: organizations.map((organization) => {
        const { membership } = organization as Organization & {
          membership: Membership;
        };
        return {
          organization,
          role: membership.role,
          clientId: membership.clientId,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getCurrent(): Promise<Organization> {
    const organization = await this.organizations.findOneBy({
      id: this.requireOrgId(),
    });
    if (!organization) {
      // TenantGuard üyeliği doğruladı; org arada silinmiş olabilir.
      throw new TenantContextMissingError();
    }
    return organization;
  }

  async update(input: UpdateOrganizationInput): Promise<Organization> {
    const orgId = this.requireOrgId();
    try {
      return await this.dataSource.transaction(async (manager) => {
        await lockOrganization(manager, orgId);
        const repository = manager.getRepository(Organization);
        const current = await repository.findOneByOrFail({ id: orgId });
        const patch: Partial<Organization> = {};
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.slug !== undefined) patch.slug = input.slug;
        if (input.settings !== undefined) patch.settings = input.settings;

        await repository.update({ id: orgId }, patch);
        await this.audit.record(
          {
            action: AuditAction.OrganizationUpdated,
            entityType: 'organization',
            entityId: orgId,
            changes: diff(current, patch),
          },
          manager,
        );
        return Object.assign(current, patch);
      });
    } catch (error) {
      if (isSlugConflict(error)) {
        throw new OrganizationSlugTakenError();
      }
      throw error;
    }
  }

  /**
   * Organizasyonu ve (FK cascade ile) üyelik ve davetlerini siler. Audit kaydı
   * org'a FK'li olmadığı için kalır. Üyelerin cache'i commit'ten sonra silinir.
   */
  async delete(): Promise<void> {
    const orgId = this.requireOrgId();
    const userIds = await this.dataSource.transaction(async (manager) => {
      await lockOrganization(manager, orgId);
      const organization = await manager
        .getRepository(Organization)
        .findOneByOrFail({ id: orgId });
      const memberUserIds = await this.memberships.memberUserIds(manager);
      await this.audit.record(
        {
          action: AuditAction.OrganizationDeleted,
          entityType: 'organization',
          entityId: orgId,
          changes: { name: organization.name, slug: organization.slug },
        },
        manager,
      );
      await manager.getRepository(Organization).delete({ id: orgId });
      return memberUserIds;
    });
    await this.memberships.invalidateCache(orgId, userIds);
  }

  /** Davet önizlemesi gibi tenant dışı akışlar için; id güvenilir kaynaktan gelmeli. */
  findById(id: string): Promise<Organization | null> {
    return this.organizations.findOneBy({ id });
  }

  private insertWithOwner(
    input: CreateOrganizationInput,
    slug: string,
    userId: string,
  ): Promise<Organization> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const organization = await manager.getRepository(Organization).save(
        manager.getRepository(Organization).create({
          name: input.name.trim(),
          slug,
          settings: input.settings ?? {},
        }),
      );
      await runInTenant(this.cls, organization.id, async () => {
        await this.audit.record(
          {
            action: AuditAction.OrganizationCreated,
            entityType: 'organization',
            entityId: organization.id,
            changes: { name: organization.name, slug: organization.slug },
          },
          manager,
        );
        await this.memberships.add(
          {
            orgId: organization.id,
            userId,
            role: OrgRole.Owner,
            clientId: null,
            invitedBy: null,
          },
          manager,
        );
      });
      return organization;
    });
  }

  private requireOrgId(): string {
    const orgId = this.cls.get('orgId');
    if (!orgId) {
      throw new TenantContextMissingError();
    }
    return orgId;
  }
}

function randomSuffix(): string {
  return randomBytes(SLUG_SUFFIX_BYTES).toString('hex');
}

function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint ===
      SLUG_UNIQUE_CONSTRAINT
  );
}

function diff(
  current: Organization,
  patch: Partial<Organization>,
): Record<string, unknown> {
  const before = current as unknown as Record<string, unknown>;
  const after = patch as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    changes[key] = { from: before[key], to: after[key] };
  }
  return changes;
}
