import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditService } from '../audit-logs/audit.service';
import { ClientNotFoundError } from './clients.errors';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_B = '0190f0e4-0000-7000-8000-00000000000c';

type Row = Pick<Client, 'id' | 'orgId' | 'name' | 'isActive'>;

/** `createQueryBuilder`'ın kendi kullandığımız `andWhere` desenlerini yorumlayan basit bir sahte. */
class FakeQueryBuilder {
  private filters: Array<(item: Row) => boolean> = [];
  private skipN = 0;
  private takeN = Number.POSITIVE_INFINITY;

  constructor(private readonly items: Row[]) {}

  orderBy(): this {
    return this;
  }

  addOrderBy(): this {
    return this;
  }

  skip(n: number): this {
    this.skipN = n;
    return this;
  }

  take(n: number): this {
    this.takeN = n;
    return this;
  }

  andWhere(sql: string, params: Record<string, unknown>): this {
    if (sql.includes('ILIKE')) {
      const search = String(params.search).replace(/%/g, '').toLowerCase();
      this.filters.push((item) => item.name.toLowerCase().includes(search));
    }
    return this;
  }

  getManyAndCount(): Promise<[Row[], number]> {
    const filtered = this.items.filter((item) =>
      this.filters.every((f) => f(item)),
    );
    return Promise.resolve([
      filtered.slice(this.skipN, this.skipN + this.takeN),
      filtered.length,
    ]);
  }
}

function setup(rows: Row[]) {
  const table = rows.map((row) => ({ ...row }));
  const find = (where: Partial<Row>) =>
    table.find((row) =>
      Object.entries(where).every(
        ([key, value]) => row[key as keyof Row] === value,
      ),
    );

  const clients = {
    createQueryBuilder: jest.fn(() => new FakeQueryBuilder(table)),
    findBy: jest.fn((where: Partial<Row>) =>
      Promise.resolve(table.filter((row) => row.id === where.id)),
    ),
    findOneBy: jest.fn((where: Partial<Row>) =>
      Promise.resolve(find(where) ? { ...find(where) } : null),
    ),
    save: jest.fn((entity: Partial<Row>) => {
      const row = {
        id: `new-${table.length + 1}`,
        orgId: ORG,
        ...entity,
      } as Row;
      table.push(row);
      return Promise.resolve(row);
    }),
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
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ClientsService(
    clients as unknown as TenantRepository<Client>,
    audit as unknown as AuditService,
  );
  return { service, table, clients, audit };
}

const rows = (): Row[] => [
  { id: CLIENT_A, orgId: ORG, name: 'Acme', isActive: true },
  { id: CLIENT_B, orgId: ORG, name: 'Beta Ajans', isActive: true },
];

const asAdmin: TenantContext = {
  orgId: ORG,
  role: OrgRole.Admin,
  clientId: null,
};
const asViewerA: TenantContext = {
  orgId: ORG,
  role: OrgRole.ClientViewer,
  clientId: CLIENT_A,
};

describe('ClientsService', () => {
  describe('list', () => {
    it("admin/owner/analyst tüm client'ları sayfalı ve aranabilir görür", async () => {
      const { service } = setup(rows());

      const page = await service.list({ page: 1, limit: 50 }, asAdmin);

      expect(page.total).toBe(2);
      expect(page.items.map((i) => i.name)).toEqual(['Acme', 'Beta Ajans']);
    });

    it('arama adında filtreler', async () => {
      const { service } = setup(rows());

      const page = await service.list(
        { page: 1, limit: 50, search: 'beta' },
        asAdmin,
      );

      expect(page.items.map((i) => i.id)).toEqual([CLIENT_B]);
    });

    it("client_viewer yalnız kendi client'ını görür", async () => {
      const { service } = setup(rows());

      const page = await service.list({ page: 1, limit: 50 }, asViewerA);

      expect(page.items.map((i) => i.id)).toEqual([CLIENT_A]);
      expect(page.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it("client_viewer başka client'a eriştiğinde 404", async () => {
      const { service } = setup(rows());

      await expect(service.findOne(CLIENT_B, asViewerA)).rejects.toBeInstanceOf(
        ClientNotFoundError,
      );
    });

    it("client_viewer kendi client'ını görebilir", async () => {
      const { service } = setup(rows());

      await expect(service.findOne(CLIENT_A, asViewerA)).resolves.toMatchObject(
        {
          id: CLIENT_A,
        },
      );
    });

    it('olmayan id 404', async () => {
      const { service } = setup(rows());

      await expect(service.findOne('yok', asAdmin)).rejects.toBeInstanceOf(
        ClientNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('client ekler ve audit’e yazar', async () => {
      const { service, audit } = setup([]);

      const client = await service.create({ name: '  Yeni Client  ' });

      expect(client.name).toBe('Yeni Client');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.created',
          entityType: 'client',
        }),
      );
    });
  });

  describe('delete', () => {
    it('olmayan client için 404', async () => {
      const { service } = setup(rows());

      await expect(service.delete('yok')).rejects.toBeInstanceOf(
        ClientNotFoundError,
      );
    });

    it('client’ı siler ve audit’e yazar', async () => {
      const { service, table, audit } = setup(rows());

      await service.delete(CLIENT_A);

      expect(table.map((r) => r.id)).toEqual([CLIENT_B]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.deleted',
          entityType: 'client',
          entityId: CLIENT_A,
        }),
      );
    });
  });
});
