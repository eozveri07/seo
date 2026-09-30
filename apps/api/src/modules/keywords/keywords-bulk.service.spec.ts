import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit-logs/audit.service';
import { Project, ProjectStatus } from '../clients/entities/project.entity';
import { ProjectsService } from '../clients/projects.service';
import { BulkAddKeywordsDto } from './dto/bulk-add-keywords.dto';
import { KeywordGroup } from './entities/keyword-group.entity';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
} from './entities/tracked-keyword.entity';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';
import { KeywordsBulkService } from './keywords-bulk.service';
import { TooManyKeywordsError } from './keywords.errors';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function project(): Project {
  return {
    id: PROJECT_ID,
    orgId: ORG,
    clientId: 'client-1',
    name: 'Proje',
    domain: 'example.com',
    countryCode: null,
    languageCode: null,
    dfsLocationCode: null,
    dfsLanguageCode: null,
    timezone: null,
    status: ProjectStatus.Active,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Project;
}

interface KeywordRow {
  id: string;
  orgId: string;
  projectId: string;
  groupId: string | null;
  keyword: string;
  keywordNormalized: string;
  device: TrackedKeywordDevice;
  locationCode: number;
  languageCode: string;
  targetUrl: string | null;
}

function setup(existingKeywords: KeywordRow[] = []) {
  const keywordRows = [...existingKeywords];
  const groupRows: KeywordGroup[] = [];

  const keywordQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(() =>
      Promise.resolve(
        keywordRows.filter((row) => row.projectId === PROJECT_ID),
      ),
    ),
  };
  const trackedKeywordsRepo = {
    createQueryBuilder: jest.fn(() => keywordQueryBuilder),
    insert: jest.fn((row: Omit<KeywordRow, 'id'>) => {
      keywordRows.push({ ...row, id: `kw-${keywordRows.length + 1}` });
      return Promise.resolve({});
    }),
  };
  const keywordGroupsRepo = {
    findOneBy: jest.fn((where: { projectId: string; name: string }) =>
      Promise.resolve(
        groupRows.find(
          (row) => row.projectId === where.projectId && row.name === where.name,
        ) ?? null,
      ),
    ),
    save: jest.fn((entity: Partial<KeywordGroup>) => {
      const row = {
        ...entity,
        id: `group-${groupRows.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as KeywordGroup;
      groupRows.push(row);
      return Promise.resolve(row);
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === TrackedKeyword ? trackedKeywordsRepo : keywordGroupsRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      async <T>(callback: (manager: EntityManager) => Promise<T>) =>
        callback(manager as unknown as EntityManager),
    ),
  };
  const projectsService = { findOne: jest.fn().mockResolvedValue(project()) };
  const keywordVolumeJobs = {
    enqueueManual: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new KeywordsBulkService(
    dataSource as unknown as DataSource,
    projectsService as unknown as ProjectsService,
    keywordVolumeJobs as unknown as KeywordVolumeJobsService,
    audit as unknown as AuditService,
  );
  return { service, keywordRows, groupRows, keywordVolumeJobs, audit };
}

function dto(text: string, overrides: Partial<BulkAddKeywordsDto> = {}) {
  return Object.assign(new BulkAddKeywordsDto(), { text, ...overrides });
}

describe('KeywordsBulkService', () => {
  it('40 satırlık düz metni tek istekte, tek transaction’da ekler', async () => {
    const { service, keywordRows } = setup();
    const lines = Array.from({ length: 40 }, (_, i) => `seo keyword ${i + 1}`);

    const result = await service.bulkAdd(
      ORG,
      PROJECT_ID,
      dto(lines.join('\n')),
    );

    expect(result).toEqual({ added: 40, skipped: 0, errors: [] });
    expect(keywordRows).toHaveLength(40);
  });

  it('40 satırlık CSV’yi (keyword,grup,cihaz,hedef url) ayrıştırır ve gruplar', async () => {
    const { service, keywordRows, groupRows } = setup();
    const lines = Array.from(
      { length: 40 },
      (_, i) =>
        `seo keyword ${i + 1},Grup ${i % 4},${i % 2 === 0 ? 'desktop' : 'mobile'},https://example.com/${i}`,
    );

    const result = await service.bulkAdd(
      ORG,
      PROJECT_ID,
      dto(lines.join('\n')),
    );

    expect(result).toEqual({ added: 40, skipped: 0, errors: [] });
    expect(keywordRows).toHaveLength(40);
    expect(groupRows).toHaveLength(4);
    expect(keywordRows[1].device).toBe('mobile');
    expect(keywordRows[1].targetUrl).toBe('https://example.com/1');
  });

  it('istek içindeki tekrar eden satırları atlar ve satır numarasıyla raporlar', async () => {
    const { service } = setup();
    const text = ['seo aracı', 'SEO   Aracı', 'farklı keyword'].join('\n');

    const result = await service.bulkAdd(ORG, PROJECT_ID, dto(text));

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].message).toContain('İstek içinde tekrar');
  });

  it('DB’de zaten takip edilen keyword’ü atlar', async () => {
    const existing: KeywordRow = {
      id: 'kw-existing',
      orgId: ORG,
      projectId: PROJECT_ID,
      groupId: null,
      keyword: 'seo aracı',
      keywordNormalized: 'seo aracı',
      device: TrackedKeywordDevice.Desktop,
      locationCode: 2840,
      languageCode: 'en',
      targetUrl: null,
    };
    const { service } = setup([existing]);

    const result = await service.bulkAdd(
      ORG,
      PROJECT_ID,
      dto('seo aracı\nyeni keyword'),
    );

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[0].message).toContain('zaten takip ediliyor');
  });

  it('boş satırları yok sayar, satır numaralarını orijinal metne göre korur', async () => {
    const { service, keywordRows } = setup();
    const text = ['seo aracı', '', '  ', 'ikinci keyword'].join('\n');

    const result = await service.bulkAdd(ORG, PROJECT_ID, dto(text));

    expect(result).toEqual({ added: 2, skipped: 0, errors: [] });
    expect(keywordRows.map((row) => row.keyword)).toEqual([
      'seo aracı',
      'ikinci keyword',
    ]);
  });

  it('1000 satır limitini aşan istek TOO_MANY_KEYWORDS ile reddedilir', async () => {
    const { service } = setup();
    const text = Array.from({ length: 1001 }, (_, i) => `keyword ${i}`).join(
      '\n',
    );

    await expect(
      service.bulkAdd(ORG, PROJECT_ID, dto(text)),
    ).rejects.toBeInstanceOf(TooManyKeywordsError);
  });

  it('eklenen keyword varsa keyword-volume job’unu anında tetikler', async () => {
    const { service, keywordVolumeJobs } = setup();

    await service.bulkAdd(ORG, PROJECT_ID, dto('seo aracı'));

    expect(keywordVolumeJobs.enqueueManual).toHaveBeenCalledWith(
      ORG,
      PROJECT_ID,
    );
  });

  it('hiçbir satır eklenmezse keyword-volume job’u tetiklenmez', async () => {
    const { service, keywordVolumeJobs } = setup();

    await service.bulkAdd(ORG, PROJECT_ID, dto(','));

    expect(keywordVolumeJobs.enqueueManual).not.toHaveBeenCalled();
  });
});
