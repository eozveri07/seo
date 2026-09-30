import { QueryFailedError } from 'typeorm';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { ProjectsService } from '../clients/projects.service';
import { Project, ProjectStatus } from '../clients/entities/project.entity';
import { AuditService } from '../audit-logs/audit.service';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
} from './entities/tracked-keyword.entity';
import { KeywordGroupsService } from './keyword-groups.service';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';
import { TrackedKeywordsService } from './tracked-keywords.service';
import { TrackedKeywordAlreadyExistsError } from './keywords.errors';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function project(overrides: Partial<Project> = {}): Project {
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
    ...overrides,
  } as Project;
}

function setup(projectOverrides: Partial<Project> = {}) {
  const rows: TrackedKeyword[] = [];
  const keywords = {
    findOneBy: jest.fn((where: Partial<TrackedKeyword>) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as never)[key] === value,
          ),
        ) ?? null,
      ),
    ),
    save: jest.fn((entity: Partial<TrackedKeyword>) => {
      if (
        rows.some(
          (row) =>
            row.projectId === entity.projectId &&
            row.keywordNormalized === entity.keywordNormalized &&
            row.device === entity.device &&
            row.locationCode === entity.locationCode &&
            row.languageCode === entity.languageCode,
        )
      ) {
        return Promise.reject(
          new QueryFailedError('insert', [], {
            constraint:
              'UQ_tracked_keywords_project_id_normalized_device_location_language',
          } as unknown as Error),
        );
      }
      const row = {
        ...entity,
        id: `kw-${rows.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TrackedKeyword;
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const projectsService = {
    findOne: jest.fn().mockResolvedValue(project(projectOverrides)),
  };
  const keywordGroups = {
    findOne: jest.fn().mockResolvedValue({ id: 'group-1' }),
  };
  const keywordVolumeJobs = {
    enqueueManual: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new TrackedKeywordsService(
    keywords as unknown as TenantRepository<TrackedKeyword>,
    projectsService as unknown as ProjectsService,
    keywordGroups as unknown as KeywordGroupsService,
    keywordVolumeJobs as unknown as KeywordVolumeJobsService,
    audit as unknown as AuditService,
  );
  return { service, keywords, projectsService, keywordVolumeJobs, audit };
}

describe('TrackedKeywordsService', () => {
  it('projenin dfsLocationCode/dfsLanguageCode’unu varsayılan olarak kullanır', async () => {
    const { service } = setup({ dfsLocationCode: 2792, dfsLanguageCode: 'tr' });

    const keyword = await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: 'seo aracı',
    });

    expect(keyword.locationCode).toBe(2792);
    expect(keyword.languageCode).toBe('tr');
  });

  it('proje lokasyon/dil ayarı yoksa ABD/İngilizce varsayılanını kullanır', async () => {
    const { service } = setup();

    const keyword = await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: 'seo aracı',
    });

    expect(keyword.locationCode).toBe(2840);
    expect(keyword.languageCode).toBe('en');
  });

  it('keyword_normalized’i normalizeKeyword ile üretir', async () => {
    const { service } = setup();

    const keyword = await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: '  SEO   Otomasyonu  ',
    });

    expect(keyword.keywordNormalized).toBe('seo otomasyonu');
  });

  it('oluşturunca keyword-volume job’u anında tetikler', async () => {
    const { service, keywordVolumeJobs } = setup();

    await service.create(ORG, { projectId: PROJECT_ID, keyword: 'seo' });

    expect(keywordVolumeJobs.enqueueManual).toHaveBeenCalledWith(
      ORG,
      PROJECT_ID,
    );
  });

  it('aynı (proje, normalize, cihaz, lokasyon, dil) ikinci kez eklenemez', async () => {
    const { service } = setup();
    await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: 'seo aracı',
      device: TrackedKeywordDevice.Desktop,
    });

    await expect(
      service.create(ORG, {
        projectId: PROJECT_ID,
        keyword: 'SEO Aracı',
        device: TrackedKeywordDevice.Desktop,
      }),
    ).rejects.toBeInstanceOf(TrackedKeywordAlreadyExistsError);
  });

  it('farklı cihazla aynı keyword eklenebilir', async () => {
    const { service } = setup();
    await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: 'seo aracı',
      device: TrackedKeywordDevice.Desktop,
    });

    const mobile = await service.create(ORG, {
      projectId: PROJECT_ID,
      keyword: 'seo aracı',
      device: TrackedKeywordDevice.Mobile,
    });

    expect(mobile.device).toBe(TrackedKeywordDevice.Mobile);
  });
});
