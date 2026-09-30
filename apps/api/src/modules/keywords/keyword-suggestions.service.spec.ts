import 'reflect-metadata';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { KeywordSuggestionsQueryDto } from './dto/keyword-suggestions-query.dto';
import { TrackedKeyword } from './entities/tracked-keyword.entity';
import { KeywordSuggestionsService } from './keyword-suggestions.service';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const TODAY = '2026-09-30';

function setup(
  candidates: { query: string; impressions: number }[],
  trackedNormalized: string[],
) {
  const query = jest.fn().mockResolvedValue(
    candidates.map((row) => ({
      query: row.query,
      clicks: 1,
      impressions: row.impressions,
      ctr: 0.1,
      position: 5,
    })),
  );
  const trackedKeywords = {
    findBy: jest
      .fn()
      .mockResolvedValue(
        trackedNormalized.map((keywordNormalized) => ({ keywordNormalized })),
      ),
  };
  const cls = {
    isActive: () => true,
    get: () => 'org-1',
  } as unknown as ClsService<AppClsStore>;
  const service = new KeywordSuggestionsService(
    { query } as unknown as DataSource,
    trackedKeywords as unknown as TenantRepository<TrackedKeyword>,
    cls,
  );
  return { service, query, trackedKeywords };
}

function suggestionsQuery(overrides: Partial<KeywordSuggestionsQueryDto> = {}) {
  return Object.assign(new KeywordSuggestionsQueryDto(), overrides);
}

describe('KeywordSuggestionsService', () => {
  it('takipteki keyword’leri normalize ederek hariç tutar', async () => {
    const { service } = setup(
      [
        { query: 'seo otomasyonu', impressions: 500 },
        { query: 'SEO   Otomasyonu', impressions: 400 },
        { query: 'rank tracking', impressions: 300 },
      ],
      ['seo otomasyonu'],
    );

    const result = await service.suggestions(
      PROJECT_ID,
      suggestionsQuery(),
      TODAY,
    );

    expect(result.items.map((item) => item.query)).toEqual(['rank tracking']);
  });

  it('SQL’in döndürdüğü (gösterime göre azalan) sırayı koruyup limit uygular', async () => {
    const { service } = setup(
      [
        { query: 'b', impressions: 900 },
        { query: 'c', impressions: 100 },
        { query: 'a', impressions: 10 },
      ],
      [],
    );

    const result = await service.suggestions(
      PROJECT_ID,
      suggestionsQuery({ limit: 2 }),
      TODAY,
    );

    expect(result.items.map((item) => item.query)).toEqual(['b', 'c']);
  });

  it('son 28 günü sorgular (from/to)', async () => {
    const { service } = setup([], []);

    const result = await service.suggestions(
      PROJECT_ID,
      suggestionsQuery(),
      TODAY,
    );

    expect(result.from).toBe('2026-09-02');
    expect(result.to).toBe('2026-09-29');
  });
});
