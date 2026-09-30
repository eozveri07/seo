import { ClsService } from 'nestjs-cls';
import { EntityManager, FindOperator, Repository } from 'typeorm';
import { version as uuidVersion } from 'uuid';
import { TenantScopedEntity } from '../../database/entities/tenant-scoped.entity';
import { AppClsStore } from '../cls-store';
import {
  TenantContextMissingError,
  TenantMismatchError,
} from './tenant.errors';
import { TenantRepository } from './tenant.repository';

class Keyword extends TenantScopedEntity {
  term!: string;
}

const ORG_A = '0190f0e4-0000-7000-8000-00000000000a';
const ORG_B = '0190f0e4-0000-7000-8000-00000000000b';

function setup(orgId: string | undefined) {
  const queryBuilder = { where: jest.fn().mockReturnThis() };
  const repository = {
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    countBy: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
    existsBy: jest.fn().mockResolvedValue(false),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const cls = {
    isActive: jest.fn().mockReturnValue(true),
    get: jest.fn((key: string) => (key === 'orgId' ? orgId : undefined)),
  };
  const tenantRepository = new TenantRepository<Keyword>(
    repository as unknown as Repository<Keyword>,
    cls as unknown as ClsService<AppClsStore>,
  );
  return { tenantRepository, repository, queryBuilder, cls };
}

function firstArg(mock: jest.Mock): unknown {
  return (mock.mock.calls[0] as unknown[] | undefined)?.[0];
}

describe('TenantRepository', () => {
  describe("CLS'te orgId yokken", () => {
    const calls: [string, (repo: TenantRepository<Keyword>) => unknown][] = [
      ['find', (repo) => repo.find()],
      ['findBy', (repo) => repo.findBy({ term: 'x' })],
      ['findOne', (repo) => repo.findOne({ where: { term: 'x' } })],
      ['findOneBy', (repo) => repo.findOneBy({ term: 'x' })],
      ['findAndCount', (repo) => repo.findAndCount()],
      ['count', (repo) => repo.count()],
      ['countBy', (repo) => repo.countBy({ term: 'x' })],
      ['exists', (repo) => repo.exists()],
      ['existsBy', (repo) => repo.existsBy({ term: 'x' })],
      ['save', (repo) => repo.save({ term: 'x' })],
      ['insert', (repo) => repo.insert({ term: 'x' })],
      ['update', (repo) => repo.update('id-1', { term: 'y' })],
      ['delete', (repo) => repo.delete('id-1')],
      ['createQueryBuilder', (repo) => repo.createQueryBuilder('k')],
    ];

    it.each(calls)(
      '%s TenantContextMissingError fırlatır ve repository çağrılmaz',
      async (_name, call) => {
        const { tenantRepository, repository } = setup(undefined);

        await expect(
          Promise.resolve().then(() => call(tenantRepository)),
        ).rejects.toBeInstanceOf(TenantContextMissingError);
        for (const mock of Object.values(repository)) {
          expect(mock).not.toHaveBeenCalled();
        }
      },
    );

    it('CLS context aktif değilse de TenantContextMissingError fırlatır', () => {
      const { tenantRepository, cls } = setup(ORG_A);
      cls.isActive.mockReturnValue(false);

      expect(() => tenantRepository.find()).toThrow(TenantContextMissingError);
    });

    it('hata kodu TENANT_CONTEXT_MISSING ve durum 500', () => {
      const error = new TenantContextMissingError();

      expect(error.code).toBe('TENANT_CONTEXT_MISSING');
      expect(error.status).toBe(500);
    });
  });

  describe('okuma', () => {
    it("find where'e orgId ekler, diğer seçenekleri korur", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.find({ where: { term: 'seo' }, take: 10 });

      expect(firstArg(repository.find)).toEqual({
        where: { term: 'seo', orgId: ORG_A },
        take: 10,
      });
    });

    it('where verilmezse yalnız orgId şartı olur', async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.find();

      expect(firstArg(repository.find)).toEqual({ where: { orgId: ORG_A } });
    });

    it("findOne where'e orgId ekler", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.findOne({ where: { id: 'id-1' } });

      expect(firstArg(repository.findOne)).toEqual({
        where: { id: 'id-1', orgId: ORG_A },
      });
    });

    it("count where'e orgId ekler", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.count({ where: { term: 'seo' } });

      expect(firstArg(repository.count)).toEqual({
        where: { term: 'seo', orgId: ORG_A },
      });
    });

    it.each([
      ['findBy', 'findBy'],
      ['findOneBy', 'findOneBy'],
      ['countBy', 'countBy'],
      ['existsBy', 'existsBy'],
    ] as const)('%s where objesine orgId ekler', async (method, mockName) => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository[method]({ term: 'seo' });

      expect(firstArg(repository[mockName])).toEqual({
        term: 'seo',
        orgId: ORG_A,
      });
    });

    it.each([['findAndCount'], ['exists']] as const)(
      '%s where seçeneğine orgId ekler',
      async (method) => {
        const { tenantRepository, repository } = setup(ORG_A);

        await tenantRepository[method]({ where: { term: 'seo' } });

        expect(firstArg(repository[method])).toEqual({
          where: { term: 'seo', orgId: ORG_A },
        });
      },
    );

    it("dizi (OR) where'de her elemana orgId ekler", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.find({ where: [{ term: 'a' }, { term: 'b' }] });
      await tenantRepository.findBy([{ term: 'a' }, { id: 'id-1' }]);

      expect(firstArg(repository.find)).toEqual({
        where: [
          { term: 'a', orgId: ORG_A },
          { term: 'b', orgId: ORG_A },
        ],
      });
      expect(firstArg(repository.findBy)).toEqual([
        { term: 'a', orgId: ORG_A },
        { id: 'id-1', orgId: ORG_A },
      ]);
    });

    it("çağıranın verdiği farklı orgId CLS'tekiyle ezilir", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.find({ where: { orgId: ORG_B } });
      await tenantRepository.findOneBy([{ orgId: ORG_B }, { term: 'x' }]);

      expect(firstArg(repository.find)).toEqual({ where: { orgId: ORG_A } });
      expect(firstArg(repository.findOneBy)).toEqual([
        { orgId: ORG_A },
        { term: 'x', orgId: ORG_A },
      ]);
    });
  });

  describe('save ve insert', () => {
    it("save yeni entity'nin orgId'sini CLS'tekine set eder", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.save({ term: 'seo' });

      expect(firstArg(repository.save)).toEqual({
        term: 'seo',
        orgId: ORG_A,
        id: expect.any(String) as unknown,
      });
      expect(repository.countBy).not.toHaveBeenCalled();
    });

    it('save id’siz düz objeye UUIDv7 id atar', async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.save({ term: 'seo' });

      const saved = firstArg(repository.save) as Keyword;
      expect(uuidVersion(saved.id)).toBe(7);
      expect(repository.countBy).not.toHaveBeenCalled();
    });

    it("withManager aynı org kapsamıyla transaction'ın repository'sini kullanır", async () => {
      const { cls } = setup(ORG_A);
      const managerRepository = {
        target: Keyword,
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(managerRepository),
      };
      const base = new TenantRepository<Keyword>(
        { target: Keyword } as unknown as Repository<Keyword>,
        cls as unknown as ClsService<AppClsStore>,
      );

      await base
        .withManager(manager as unknown as EntityManager)
        .find({ where: { term: 'seo' } });

      expect(manager.getRepository).toHaveBeenCalledWith(Keyword);
      expect(firstArg(managerRepository.find)).toEqual({
        where: { term: 'seo', orgId: ORG_A },
      });
    });

    it("save dizideki her entity'ye orgId set eder", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.save([{ term: 'a' }, { term: 'b', orgId: ORG_A }]);

      expect(firstArg(repository.save)).toMatchObject([
        { term: 'a', orgId: ORG_A },
        { term: 'b', orgId: ORG_A },
      ]);
    });

    it("save farklı orgId'li entity'yi reddeder", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await expect(
        tenantRepository.save({ term: 'seo', orgId: ORG_B }),
      ).rejects.toBeInstanceOf(TenantMismatchError);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("save başka org'a ait bir id ile satırı güncellemeyi reddeder", async () => {
      const { tenantRepository, repository } = setup(ORG_A);
      repository.countBy.mockResolvedValue(1);

      await expect(
        tenantRepository.save({ id: 'foreign-id', term: 'seo' }),
      ).rejects.toBeInstanceOf(TenantMismatchError);

      const where = firstArg(repository.countBy) as Record<string, unknown>;
      expect((where.id as FindOperator<string[]>).value).toEqual([
        'foreign-id',
      ]);
      expect(where.orgId).toBeInstanceOf(FindOperator);
      expect((where.orgId as FindOperator<string>).type).toBe('not');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('save kendi org id’si olan entity’yi günceller', async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.save({ id: 'own-id', term: 'seo' });

      expect(firstArg(repository.save)).toEqual({
        id: 'own-id',
        term: 'seo',
        orgId: ORG_A,
      });
    });

    it('insert orgId set eder ve id yoksa UUIDv7 üretir', async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.insert({ term: 'seo' });

      const inserted = firstArg(repository.insert) as Keyword;
      expect(inserted.orgId).toBe(ORG_A);
      expect(uuidVersion(inserted.id)).toBe(7);
    });

    it("insert farklı orgId'li entity'yi reddeder", () => {
      const { tenantRepository, repository } = setup(ORG_A);

      expect(() =>
        tenantRepository.insert([{ term: 'a' }, { term: 'b', orgId: ORG_B }]),
      ).toThrow(TenantMismatchError);
      expect(repository.insert).not.toHaveBeenCalled();
    });
  });

  describe('update ve delete', () => {
    it("update obje criteria'ya orgId şartı ekler", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.update({ term: 'a' }, { term: 'b' });

      expect(repository.update).toHaveBeenCalledWith(
        { term: 'a', orgId: ORG_A },
        { term: 'b' },
      );
    });

    it("update çıplak id'yi { id, orgId } şartına çevirir", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.update('id-1', { term: 'b' });

      expect(repository.update).toHaveBeenCalledWith(
        { id: 'id-1', orgId: ORG_A },
        { term: 'b' },
      );
    });

    it('update partial içinde orgId değiştirmeyi reddeder', () => {
      const { tenantRepository, repository } = setup(ORG_A);

      expect(() => tenantRepository.update('id-1', { orgId: ORG_B })).toThrow(
        TenantMismatchError,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('delete id dizisini { id: In(ids), orgId } şartına çevirir', async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.delete(['id-1', 'id-2']);

      const where = firstArg(repository.delete) as Record<string, unknown>;
      expect(where.orgId).toBe(ORG_A);
      expect(where.id).toBeInstanceOf(FindOperator);
      expect((where.id as FindOperator<string[]>).type).toBe('in');
      expect((where.id as FindOperator<string[]>).value).toEqual([
        'id-1',
        'id-2',
      ]);
    });

    it("delete obje criteria'daki farklı orgId'yi ezer", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.delete({ term: 'a', orgId: ORG_B });

      expect(repository.delete).toHaveBeenCalledWith({
        term: 'a',
        orgId: ORG_A,
      });
    });

    it("delete dizi (OR) criteria'da her elemana orgId ekler", async () => {
      const { tenantRepository, repository } = setup(ORG_A);

      await tenantRepository.delete([{ term: 'a' }, { term: 'b' }]);

      expect(repository.delete).toHaveBeenCalledWith([
        { term: 'a', orgId: ORG_A },
        { term: 'b', orgId: ORG_A },
      ]);
    });

    it.each([
      ['boş obje', {}],
      ['boş dizi', []],
    ])(
      "%s criteria'yı reddeder (org'un tüm satırlarını etkilerdi)",
      (_name, criteria) => {
        const { tenantRepository, repository } = setup(ORG_A);

        expect(() => tenantRepository.delete(criteria)).toThrow();
        expect(() =>
          tenantRepository.update(criteria, { term: 'x' }),
        ).toThrow();
        expect(repository.delete).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('createQueryBuilder', () => {
    it('org_id şartıyla başlatılmış builder döner', () => {
      const { tenantRepository, repository, queryBuilder } = setup(ORG_A);

      const result = tenantRepository.createQueryBuilder('keyword');

      expect(result).toBe(queryBuilder);
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('keyword');
      const [condition, parameters] = queryBuilder.where.mock.calls[0] as [
        string,
        Record<string, string>,
      ];
      const [, parameterName] = /^keyword\.org_id = :(\w+)$/.exec(
        condition,
      ) ?? [undefined, ''];
      expect(parameterName).not.toBe('');
      expect(parameters).toEqual({ [parameterName]: ORG_A });
    });

    it("geçersiz alias'ı reddeder", () => {
      const { tenantRepository, repository } = setup(ORG_A);

      expect(() => tenantRepository.createQueryBuilder('k; DROP')).toThrow();
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
