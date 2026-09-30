import { Repository } from 'typeorm';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from './entities/tracked-keyword.entity';
import { TrackedKeywordNotFoundError } from './keywords.errors';
import { RankableKeywordsService } from './rankable-keywords.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';

function entity(): TrackedKeyword {
  return {
    id: 'kw-1',
    orgId: ORG,
    projectId: PROJECT,
    keyword: 'SEO Araçları',
    keywordNormalized: 'seo araçları',
    device: TrackedKeywordDevice.Mobile,
    locationCode: 2792,
    languageCode: 'tr',
    frequency: TrackedKeywordFrequency.Weekly,
    depth: 50,
    isActive: true,
  } as TrackedKeyword;
}

function setup() {
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue([{ orgId: ORG, projectId: PROJECT }]),
  };
  const systemKeywords = { createQueryBuilder: jest.fn(() => queryBuilder) };
  const keywords = {
    find: jest.fn().mockResolvedValue([entity()]),
    findOneBy: jest.fn().mockResolvedValue(entity()),
  };
  const service = new RankableKeywordsService(
    systemKeywords as unknown as Repository<TrackedKeyword>,
    keywords as unknown as TenantRepository<TrackedKeyword>,
  );
  return { service, queryBuilder, keywords };
}

describe('RankableKeywordsService', () => {
  it("dispatch için aktif keyword'ü olan aktif projeleri sıklığa göre listeler", async () => {
    const { service, queryBuilder } = setup();

    await expect(
      service.listProjectsForRank([TrackedKeywordFrequency.Weekly]),
    ).resolves.toEqual([{ orgId: ORG, projectId: PROJECT }]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'keyword.frequency IN (:...frequencies)',
      { frequencies: ['weekly'] },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'project.status = :projectStatus',
      { projectStatus: 'active' },
    );
  });

  it("projenin aktif keyword'lerini rank parametreleriyle döner", async () => {
    const { service, keywords } = setup();

    const result = await service.listActive(PROJECT, [
      TrackedKeywordFrequency.Daily,
      TrackedKeywordFrequency.Weekly,
    ]);

    expect(keywords.find).toHaveBeenCalledWith({
      where: [
        { projectId: PROJECT, isActive: true, frequency: 'daily' },
        { projectId: PROJECT, isActive: true, frequency: 'weekly' },
      ],
      order: { id: 'ASC' },
    });
    expect(result).toEqual([
      {
        id: 'kw-1',
        projectId: PROJECT,
        keyword: 'SEO Araçları',
        device: 'mobile',
        locationCode: 2792,
        languageCode: 'tr',
        frequency: 'weekly',
        depth: 50,
      },
    ]);
  });

  it('keyword projede yoksa TRACKED_KEYWORD_NOT_FOUND', async () => {
    const { service, keywords } = setup();
    keywords.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(PROJECT, 'kw-x')).rejects.toBeInstanceOf(
      TrackedKeywordNotFoundError,
    );
  });
});
