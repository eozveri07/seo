import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  RankingsQueryService,
  resolveHistoryRange,
} from './rankings-query.service';
import {
  InvalidRankDateRangeError,
  RankResultNotFoundError,
} from './rankings.errors';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const KW1 = '0190f0e4-0000-7000-8000-0000000000c1';
const KW2 = '0190f0e4-0000-7000-8000-0000000000c2';

function setup(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue(rows);
  const cls = {
    isActive: () => true,
    get: () => ORG,
  } as unknown as ClsService<AppClsStore>;
  return {
    service: new RankingsQueryService({ query } as unknown as DataSource, cls),
    query,
  };
}

describe('RankingsQueryService', () => {
  it("history keyword'leri istek sırasıyla, noktaları tarih sırasıyla döner", async () => {
    const { service, query } = setup([
      {
        trackedKeywordId: KW1,
        date: '2026-09-27',
        position: 5,
        rankAbsolute: 6,
        url: 'u',
        source: 'dfs_standard',
      },
      {
        trackedKeywordId: KW1,
        date: '2026-09-28',
        position: null,
        rankAbsolute: null,
        url: null,
        source: 'dfs_live',
      },
    ]);

    const result = await service.history(
      PROJECT,
      { keywordIds: [KW2, KW1, KW2] },
      '2026-09-30',
    );

    expect(result).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      keywords: [
        { trackedKeywordId: KW2, points: [] },
        {
          trackedKeywordId: KW1,
          points: [
            {
              date: '2026-09-27',
              position: 5,
              rankAbsolute: 6,
              url: 'u',
              source: 'dfs_standard',
            },
            {
              date: '2026-09-28',
              position: null,
              rankAbsolute: null,
              url: null,
              source: 'dfs_live',
            },
          ],
        },
      ],
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"org_id" = $1 AND "project_id" = $2');
    expect(parameters).toEqual([
      ORG,
      PROJECT,
      [KW2, KW1],
      '2026-09-01',
      '2026-09-30',
    ]);
  });

  it('serp tarih verilmezse en son sonucu, verilirse o günü döner', async () => {
    const row = { trackedKeywordId: KW1, date: '2026-09-28' };
    const { service, query } = setup([row]);

    await expect(service.serp(PROJECT, KW1)).resolves.toEqual(row);
    await service.serp(PROJECT, KW1, '2026-09-28');

    const calls = query.mock.calls as [string, unknown[]][];
    expect(calls[0][1]).toEqual([ORG, PROJECT, KW1]);
    expect(calls[0][0]).not.toContain('"date" = $4');
    expect(calls[1][1]).toEqual([ORG, PROJECT, KW1, '2026-09-28']);
    expect(calls[1][0]).toContain('"date" = $4');
  });

  it('serp sonucu yoksa RANK_RESULT_NOT_FOUND', async () => {
    const { service } = setup([]);
    await expect(service.serp(PROJECT, KW1)).rejects.toBeInstanceOf(
      RankResultNotFoundError,
    );
  });
});

describe('resolveHistoryRange', () => {
  it('varsayılan olarak bugün dahil 30 gün', () => {
    expect(resolveHistoryRange({}, '2026-09-30')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('ters ya da bir yıldan uzun aralığı reddeder', () => {
    expect(() =>
      resolveHistoryRange(
        { from: '2026-09-30', to: '2026-09-01' },
        '2026-09-30',
      ),
    ).toThrow(InvalidRankDateRangeError);
    expect(() =>
      resolveHistoryRange(
        { from: '2025-01-01', to: '2026-09-01' },
        '2026-09-30',
      ),
    ).toThrow(InvalidRankDateRangeError);
    expect(() =>
      resolveHistoryRange({ from: '2026-02-30' }, '2026-09-30'),
    ).toThrow(InvalidRankDateRangeError);
  });
});
