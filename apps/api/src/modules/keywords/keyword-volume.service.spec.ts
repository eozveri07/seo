import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { TrackedKeyword } from './entities/tracked-keyword.entity';
import { KeywordVolumeService } from './keyword-volume.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function keyword(overrides: Partial<TrackedKeyword> = {}): TrackedKeyword {
  return {
    id: `kw-${Math.random()}`,
    orgId: ORG,
    projectId: PROJECT_ID,
    groupId: null,
    keyword: 'seo aracı',
    keywordNormalized: 'seo araci',
    device: 'desktop',
    locationCode: 2840,
    languageCode: 'en',
    frequency: 'daily',
    depth: 20,
    targetUrl: null,
    tags: [],
    isActive: true,
    searchVolume: null,
    cpc: null,
    volumeUpdatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TrackedKeyword;
}

function setup(rows: TrackedKeyword[]) {
  const keywords = {
    find: jest.fn((options: { where: { isActive: boolean } }) =>
      Promise.resolve(
        rows.filter((row) => row.isActive === options.where.isActive),
      ),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const dataForSeoClient = {
    keywordSearchVolume: jest.fn(),
  };
  const service = new KeywordVolumeService(
    keywords as unknown as TenantRepository<TrackedKeyword>,
    dataForSeoClient as unknown as DataForSeoClient,
  );
  return { service, keywords, dataForSeoClient };
}

describe('KeywordVolumeService', () => {
  it('hacmi hiç güncellenmemiş keyword’ü DataForSEO’dan çeker ve yazar', async () => {
    const kw = keyword();
    const { service, keywords, dataForSeoClient } = setup([kw]);
    dataForSeoClient.keywordSearchVolume.mockResolvedValue([
      { keyword: 'seo araci', searchVolume: 1200, cpc: 3.45 },
    ]);

    const stats = await service.refreshProject(ORG, PROJECT_ID, 'run-1');

    expect(stats).toEqual({ projectId: PROJECT_ID, checked: 1, updated: 1 });
    expect(dataForSeoClient.keywordSearchVolume).toHaveBeenCalledWith(
      ['seo araci'],
      2840,
      'en',
      { orgId: ORG, projectId: PROJECT_ID, jobRunId: 'run-1' },
    );
    expect(keywords.update).toHaveBeenCalledWith(
      { id: kw.id },
      expect.objectContaining({ searchVolume: 1200, cpc: '3.45' }),
    );
  });

  it('30 günden yeni güncellenmiş keyword’ü atlar', async () => {
    const fresh = keyword({ volumeUpdatedAt: new Date() });
    const { service, dataForSeoClient } = setup([fresh]);

    const stats = await service.refreshProject(ORG, PROJECT_ID);

    expect(stats).toEqual({ projectId: PROJECT_ID, checked: 0, updated: 0 });
    expect(dataForSeoClient.keywordSearchVolume).not.toHaveBeenCalled();
  });

  it('pasif keyword’leri atlar', async () => {
    const inactive = keyword({ isActive: false });
    const { service, dataForSeoClient } = setup([inactive]);

    await service.refreshProject(ORG, PROJECT_ID);

    expect(dataForSeoClient.keywordSearchVolume).not.toHaveBeenCalled();
  });

  it('farklı (locationCode, languageCode) gruplarını ayrı isteklerle çağırır', async () => {
    const us = keyword({ keywordNormalized: 'us keyword' });
    const tr = keyword({
      keywordNormalized: 'tr keyword',
      locationCode: 2792,
      languageCode: 'tr',
    });
    const { service, dataForSeoClient } = setup([us, tr]);
    dataForSeoClient.keywordSearchVolume.mockResolvedValue([]);

    await service.refreshProject(ORG, PROJECT_ID);

    expect(dataForSeoClient.keywordSearchVolume).toHaveBeenCalledTimes(2);
    expect(dataForSeoClient.keywordSearchVolume).toHaveBeenCalledWith(
      ['us keyword'],
      2840,
      'en',
      expect.anything(),
    );
    expect(dataForSeoClient.keywordSearchVolume).toHaveBeenCalledWith(
      ['tr keyword'],
      2792,
      'tr',
      expect.anything(),
    );
  });

  it('sonuçta olmayan keyword için hacmi null yazar', async () => {
    const kw = keyword();
    const { service, keywords, dataForSeoClient } = setup([kw]);
    dataForSeoClient.keywordSearchVolume.mockResolvedValue([]);

    await service.refreshProject(ORG, PROJECT_ID);

    expect(keywords.update).toHaveBeenCalledWith(
      { id: kw.id },
      expect.objectContaining({ searchVolume: null, cpc: null }),
    );
  });
});
