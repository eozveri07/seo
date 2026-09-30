import { Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { InMemoryKeyValueCache } from '../../infra/cache/in-memory-key-value-cache';
import { KeyValueCache } from '../../infra/cache/key-value-cache';
import { AuditService } from '../audit-logs/audit.service';
import { UsersService } from '../users/users.service';
import { Membership } from './entities/membership.entity';
import {
  MEMBERSHIP_CACHE_TTL_SECONDS,
  MembershipCache,
  membershipCacheKey,
} from './membership-cache';
import { MembershipsService } from './memberships.service';
import {
  InvalidClientScopeError,
  LastOwnerError,
  MemberNotFoundError,
  OwnerRoleRequiredError,
} from './organizations.errors';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const OWNER = '0190f0e4-0000-7000-8000-0000000000a1';
const ADMIN = '0190f0e4-0000-7000-8000-0000000000a2';
const ANALYST = '0190f0e4-0000-7000-8000-0000000000a3';
const CLIENT = '0190f0e4-0000-7000-8000-00000000c001';

type Row = Pick<Membership, 'id' | 'orgId' | 'userId' | 'role' | 'clientId'>;

/**
 * Tek org'un memberships tablosu. TenantRepository'nin org kapsamı ayrıca
 * test edildiği için burada yalnız bu org'un satırları tutulur.
 */
function setup(
  rows: Row[],
  cacheStore: KeyValueCache = new InMemoryKeyValueCache(),
) {
  const table = rows.map((row) => ({ ...row }));
  const find = (where: Partial<Row>) =>
    table.find((row) =>
      Object.entries(where).every(
        ([key, value]) => row[key as keyof Row] === value,
      ),
    );

  const tenantRepository = {
    withManager: jest.fn(),
    findOneBy: jest.fn((where: Partial<Row>) =>
      Promise.resolve(find(where) ? { ...find(where) } : null),
    ),
    existsBy: jest.fn((where: Partial<Row>) => Promise.resolve(!!find(where))),
    countBy: jest.fn((where: Partial<Row>) =>
      Promise.resolve(table.filter((row) => row.role === where.role).length),
    ),
    update: jest.fn((where: Partial<Row>, patch: Partial<Row>) => {
      Object.assign(find(where) ?? {}, patch);
      return Promise.resolve({ affected: 1 });
    }),
    delete: jest.fn((where: Partial<Row>) => {
      const row = find(where);
      if (row) table.splice(table.indexOf(row), 1);
      return Promise.resolve({ affected: row ? 1 : 0 });
    }),
  };
  tenantRepository.withManager.mockReturnValue(tenantRepository);
  const allMemberships = {
    findOneBy: jest.fn((where: Partial<Row>) =>
      Promise.resolve(find(where) ?? null),
    ),
  };
  const manager = { query: jest.fn().mockResolvedValue([]) };
  const dataSource = {
    transaction: jest.fn(<T>(cb: (m: EntityManager) => Promise<T>) =>
      cb(manager as unknown as EntityManager),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MembershipsService(
    allMemberships as unknown as Repository<Membership>,
    tenantRepository as unknown as TenantRepository<Membership>,
    dataSource as unknown as DataSource,
    new MembershipCache(cacheStore),
    {} as UsersService,
    audit as unknown as AuditService,
    { get: () => ORG } as unknown as ClsService<AppClsStore>,
  );
  return { service, table, allMemberships, manager, audit };
}

const owners = (): Row[] => [
  { id: 'm1', orgId: ORG, userId: OWNER, role: OrgRole.Owner, clientId: null },
  { id: 'm2', orgId: ORG, userId: ADMIN, role: OrgRole.Admin, clientId: null },
  {
    id: 'm3',
    orgId: ORG,
    userId: ANALYST,
    role: OrgRole.Analyst,
    clientId: null,
  },
];

const asOwner: TenantContext = {
  orgId: ORG,
  role: OrgRole.Owner,
  clientId: null,
};
const asAdmin: TenantContext = {
  orgId: ORG,
  role: OrgRole.Admin,
  clientId: null,
};

describe('MembershipsService', () => {
  describe('resolve (TenantGuard) ve cache', () => {
    it(`üyeliği ${MEMBERSHIP_CACHE_TTL_SECONDS} sn cache'ler; ikinci çağrı DB'ye gitmez`, async () => {
      const cache = new InMemoryKeyValueCache();
      const setSpy = jest.spyOn(cache, 'set');
      const { service, allMemberships } = setup(owners(), cache);

      const first = await service.resolve(ORG, ADMIN);
      const second = await service.resolve(ORG, ADMIN);

      expect(first).toEqual({ role: OrgRole.Admin, clientId: null });
      expect(second).toEqual(first);
      expect(allMemberships.findOneBy).toHaveBeenCalledTimes(1);
      expect(allMemberships.findOneBy).toHaveBeenCalledWith({
        orgId: ORG,
        userId: ADMIN,
      });
      expect(setSpy).toHaveBeenCalledWith(
        membershipCacheKey(ORG, ADMIN),
        expect.any(String),
        60,
      );
    });

    it('üye olmayanı cache’lemez', async () => {
      const cache = new InMemoryKeyValueCache();
      const { service } = setup(owners(), cache);

      await expect(service.resolve(ORG, 'yabanci')).resolves.toBeUndefined();

      expect(cache.has(membershipCacheKey(ORG, 'yabanci'))).toBe(false);
    });

    it('rol değişince cache silinir ve yeni rol okunur', async () => {
      const cache = new InMemoryKeyValueCache();
      const { service } = setup(owners(), cache);
      await service.resolve(ORG, ADMIN);

      await service.changeRole(ADMIN, { role: OrgRole.Analyst }, asOwner);

      expect(cache.has(membershipCacheKey(ORG, ADMIN))).toBe(false);
      await expect(service.resolve(ORG, ADMIN)).resolves.toEqual({
        role: OrgRole.Analyst,
        clientId: null,
      });
    });

    it('üye çıkarılınca cache silinir ve üyelik bulunmaz', async () => {
      const cache = new InMemoryKeyValueCache();
      const { service } = setup(owners(), cache);
      await service.resolve(ORG, ANALYST);

      await service.remove(ANALYST, asOwner);

      expect(cache.has(membershipCacheKey(ORG, ANALYST))).toBe(false);
      await expect(service.resolve(ORG, ANALYST)).resolves.toBeUndefined();
    });

    it('işlem başarısızsa cache olduğu gibi kalır', async () => {
      const cache = new InMemoryKeyValueCache();
      const { service } = setup(owners(), cache);
      await service.resolve(ORG, OWNER);

      await expect(service.remove(OWNER, asOwner)).rejects.toBeInstanceOf(
        LastOwnerError,
      );

      expect(cache.has(membershipCacheKey(ORG, OWNER))).toBe(true);
    });

    it("Redis erişilemezse DB'ye düşer", async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const broken: KeyValueCache = {
        get: () => Promise.reject(new Error('ECONNREFUSED')),
        set: () => Promise.reject(new Error('ECONNREFUSED')),
        del: () => Promise.reject(new Error('ECONNREFUSED')),
      };
      const { service } = setup(owners(), broken);

      await expect(service.resolve(ORG, OWNER)).resolves.toEqual({
        role: OrgRole.Owner,
        clientId: null,
      });
      warn.mockRestore();
    });
  });

  describe('son owner', () => {
    it('son owner çıkarılamaz', async () => {
      const { service, table } = setup(owners());

      await expect(service.remove(OWNER, asOwner)).rejects.toBeInstanceOf(
        LastOwnerError,
      );
      expect(table).toHaveLength(3);
    });

    it('son owner’ın rolü düşürülemez', async () => {
      const { service, table } = setup(owners());

      await expect(
        service.changeRole(OWNER, { role: OrgRole.Admin }, asOwner),
      ).rejects.toBeInstanceOf(LastOwnerError);
      expect(table[0].role).toBe(OrgRole.Owner);
    });

    it('başka owner varken owner çıkarılabilir; org satırı kilitlenir', async () => {
      const rows = owners();
      rows[1].role = OrgRole.Owner;
      const { service, table, manager } = setup(rows);

      await service.remove(OWNER, asOwner);

      expect(table.map((row) => row.userId)).toEqual([ADMIN, ANALYST]);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [ORG],
      );
    });
  });

  describe('rol değişimi kuralları', () => {
    it('admin owner’ın rolünü değiştiremez', async () => {
      const rows = owners();
      rows[1].role = OrgRole.Owner;
      const { service } = setup(rows);

      await expect(
        service.changeRole(OWNER, { role: OrgRole.Analyst }, asAdmin),
      ).rejects.toBeInstanceOf(OwnerRoleRequiredError);
    });

    it('admin kimseyi owner yapamaz', async () => {
      const { service } = setup(owners());

      await expect(
        service.changeRole(ANALYST, { role: OrgRole.Owner }, asAdmin),
      ).rejects.toBeInstanceOf(OwnerRoleRequiredError);
    });

    it('admin owner olmayanların rolünü değiştirebilir', async () => {
      const { service, table } = setup(owners());

      await service.changeRole(ANALYST, { role: OrgRole.Admin }, asAdmin);

      expect(table[2].role).toBe(OrgRole.Admin);
    });

    it('client_viewer’a clientId’siz geçilemez; clientId başka rollerde verilemez', async () => {
      const { service } = setup(owners());

      await expect(
        service.changeRole(ANALYST, { role: OrgRole.ClientViewer }, asOwner),
      ).rejects.toBeInstanceOf(InvalidClientScopeError);
      await expect(
        service.changeRole(
          ANALYST,
          { role: OrgRole.Admin, clientId: CLIENT },
          asOwner,
        ),
      ).rejects.toBeInstanceOf(InvalidClientScopeError);
    });

    it('client_viewer’a clientId ile geçer ve audit’e önceki/sonraki değer yazılır', async () => {
      const { service, table, audit } = setup(owners());

      await service.changeRole(
        ANALYST,
        { role: OrgRole.ClientViewer, clientId: CLIENT },
        asOwner,
      );

      expect(table[2]).toMatchObject({
        role: OrgRole.ClientViewer,
        clientId: CLIENT,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member.role_changed',
          entityId: 'm3',
          changes: {
            userId: ANALYST,
            role: { from: OrgRole.Analyst, to: OrgRole.ClientViewer },
            clientId: { from: null, to: CLIENT },
          },
        }),
        expect.anything(),
      );
    });

    it('bu org’da olmayan kullanıcı için MEMBER_NOT_FOUND', async () => {
      const { service } = setup(owners());

      await expect(
        service.changeRole('yabanci', { role: OrgRole.Admin }, asOwner),
      ).rejects.toBeInstanceOf(MemberNotFoundError);
      await expect(service.remove('yabanci', asOwner)).rejects.toBeInstanceOf(
        MemberNotFoundError,
      );
    });
  });

  it('çıkarma audit’e yazılır', async () => {
    const { service, audit } = setup(owners());

    await service.remove(ANALYST, asOwner);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.removed',
        entityType: 'membership',
        entityId: 'm3',
      }),
      expect.anything(),
    );
  });
});
