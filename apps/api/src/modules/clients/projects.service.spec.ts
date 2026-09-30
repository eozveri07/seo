import { QueryFailedError } from 'typeorm';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditService } from '../audit-logs/audit.service';
import {
  InvalidProjectClientError,
  ProjectDomainTakenError,
  ProjectNotFoundError,
} from './clients.errors';
import { Client } from './entities/client.entity';
import { Project, ProjectStatus } from './entities/project.entity';
import { ProjectsService } from './projects.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_B = '0190f0e4-0000-7000-8000-00000000000c';
const PROJECT_A1 = '0190f0e4-0000-7000-8000-00000000000d';
const PROJECT_B1 = '0190f0e4-0000-7000-8000-00000000000e';

type ProjectRow = Pick<
  Project,
  'id' | 'orgId' | 'clientId' | 'name' | 'domain' | 'status'
>;

/** `createQueryBuilder`'ın kendi kullandığımız `andWhere` desenlerini yorumlayan basit bir sahte. */
class FakeQueryBuilder {
  private filters: Array<(item: ProjectRow) => boolean> = [];
  private skipN = 0;
  private takeN = Number.POSITIVE_INFINITY;

  constructor(private readonly items: ProjectRow[]) {}

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
      this.filters.push(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.domain.toLowerCase().includes(search),
      );
    } else if (sql.includes('client_id')) {
      this.filters.push((item) => item.clientId === params.clientId);
    }
    return this;
  }

  getManyAndCount(): Promise<[ProjectRow[], number]> {
    const filtered = this.items.filter((item) =>
      this.filters.every((f) => f(item)),
    );
    return Promise.resolve([
      filtered.slice(this.skipN, this.skipN + this.takeN),
      filtered.length,
    ]);
  }
}

function setup(rows: ProjectRow[], clientIds: string[] = [CLIENT_A, CLIENT_B]) {
  const table = rows.map((row) => ({ ...row }));
  const find = (where: Partial<ProjectRow>) =>
    table.find((row) =>
      Object.entries(where).every(
        ([key, value]) => row[key as keyof ProjectRow] === value,
      ),
    );

  const projects = {
    createQueryBuilder: jest.fn(() => new FakeQueryBuilder(table)),
    findOneBy: jest.fn((where: Partial<ProjectRow>) =>
      Promise.resolve(find(where) ? { ...find(where) } : null),
    ),
    save: jest.fn((entity: Partial<ProjectRow>) => {
      if (table.some((row) => row.domain === entity.domain)) {
        return Promise.reject(
          new QueryFailedError('insert', [], {
            constraint: 'UQ_projects_org_id_domain',
          } as unknown as Error),
        );
      }
      const row = {
        id: `new-${table.length + 1}`,
        orgId: ORG,
        status: ProjectStatus.Active,
        ...entity,
      } as ProjectRow;
      table.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn(
      (where: Partial<ProjectRow>, patch: Partial<ProjectRow>) => {
        const row = find(where);
        if (
          patch.domain !== undefined &&
          table.some((r) => r !== row && r.domain === patch.domain)
        ) {
          return Promise.reject(
            new QueryFailedError('update', [], {
              constraint: 'UQ_projects_org_id_domain',
            } as unknown as Error),
          );
        }
        Object.assign(row ?? {}, patch);
        return Promise.resolve({ affected: 1 });
      },
    ),
    delete: jest.fn((where: Partial<ProjectRow>) => {
      const row = find(where);
      if (row) table.splice(table.indexOf(row), 1);
      return Promise.resolve({ affected: row ? 1 : 0 });
    }),
  };
  const clients = {
    existsBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(clientIds.includes(id)),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ProjectsService(
    projects as unknown as TenantRepository<Project>,
    clients as unknown as TenantRepository<Client>,
    audit as unknown as AuditService,
  );
  return { service, table, projects, audit };
}

const rows = (): ProjectRow[] => [
  {
    id: PROJECT_A1,
    orgId: ORG,
    clientId: CLIENT_A,
    name: 'Acme Site',
    domain: 'acme.com',
    status: ProjectStatus.Active,
  },
  {
    id: PROJECT_B1,
    orgId: ORG,
    clientId: CLIENT_B,
    name: 'Beta Blog',
    domain: 'beta.com',
    status: ProjectStatus.Active,
  },
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

describe('ProjectsService', () => {
  describe('list', () => {
    it('admin tüm projeleri sayfalı ve aranabilir görür', async () => {
      const { service } = setup(rows());

      const page = await service.list({ page: 1, limit: 50 }, asAdmin);

      expect(page.total).toBe(2);
    });

    it('domain ya da adında arar', async () => {
      const { service } = setup(rows());

      const page = await service.list(
        { page: 1, limit: 50, search: 'beta' },
        asAdmin,
      );

      expect(page.items.map((i) => i.id)).toEqual([PROJECT_B1]);
    });

    it("client_viewer yalnız kendi client'ının projelerini görür", async () => {
      const { service } = setup(rows());

      const page = await service.list({ page: 1, limit: 50 }, asViewerA);

      expect(page.items.map((i) => i.id)).toEqual([PROJECT_A1]);
      expect(page.total).toBe(1);
    });

    it('clientId query’si ile filtrelenir (client_viewer dışı roller)', async () => {
      const { service } = setup(rows());

      const page = await service.list(
        { page: 1, limit: 50, clientId: CLIENT_B },
        asAdmin,
      );

      expect(page.items.map((i) => i.id)).toEqual([PROJECT_B1]);
    });
  });

  describe('create', () => {
    it('domainini normalize ederek oluşturur ve audit’e yazar', async () => {
      const { service, audit } = setup([]);

      const project = await service.create({
        clientId: CLIENT_A,
        name: 'Yeni Proje',
        domain: 'https://WWW.Example.com/path/',
      });

      expect(project.domain).toBe('example.com');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.created',
          entityType: 'project',
        }),
      );
    });

    it("org'da olmayan client için INVALID_PROJECT_CLIENT", async () => {
      const { service } = setup([], [CLIENT_A]);

      await expect(
        service.create({
          clientId: CLIENT_B,
          name: 'Proje',
          domain: 'example.com',
        }),
      ).rejects.toBeInstanceOf(InvalidProjectClientError);
    });

    it('aynı org’da aynı domain için PROJECT_DOMAIN_TAKEN', async () => {
      const { service } = setup(rows());

      await expect(
        service.create({
          clientId: CLIENT_A,
          name: 'Kopya',
          domain: 'https://acme.com',
        }),
      ).rejects.toBeInstanceOf(ProjectDomainTakenError);
    });
  });

  describe('update', () => {
    it('domaini normalize eder', async () => {
      const { service, table } = setup(rows());

      await service.update(PROJECT_A1, { domain: 'WWW.Acme.com/yeni' });

      expect(table[0].domain).toBe('acme.com');
    });

    it('başka projenin domainine çakışırsa PROJECT_DOMAIN_TAKEN', async () => {
      const { service } = setup(rows());

      await expect(
        service.update(PROJECT_A1, { domain: 'beta.com' }),
      ).rejects.toBeInstanceOf(ProjectDomainTakenError);
    });

    it('olmayan proje için 404', async () => {
      const { service } = setup(rows());

      await expect(service.update('yok', { name: 'x' })).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
    });
  });

  describe('delete', () => {
    it('proje siler ve audit’e yazar', async () => {
      const { service, table, audit } = setup(rows());

      await service.delete(PROJECT_A1);

      expect(table.map((r) => r.id)).toEqual([PROJECT_B1]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.deleted',
          entityType: 'project',
          entityId: PROJECT_A1,
        }),
      );
    });

    it('olmayan proje için 404', async () => {
      const { service } = setup(rows());

      await expect(service.delete('yok')).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
    });
  });
});
