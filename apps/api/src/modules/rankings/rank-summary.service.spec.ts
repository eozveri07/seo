import { RankSummaryService } from './rank-summary.service';
import { RankSummaryStore } from './rank-summary-store';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const KEYWORD = '0190f0e4-0000-7000-8000-000000000001';
const DATE = '2026-09-28';

/** `jest.Mocked<RankSummaryStore>` yerine düz fonksiyon tipleri: `unbound-method` lint'i class metoduna referansı hatalı işaretliyor. */
interface MockRankSummaryStore {
  distribution: jest.Mock;
  historyAndBest: jest.Mock;
  upsertLatest: jest.Mock;
}

function setup() {
  const store: MockRankSummaryStore = {
    distribution: jest.fn(),
    historyAndBest: jest.fn(),
    upsertLatest: jest.fn().mockResolvedValue(undefined),
  };
  return {
    store,
    service: new RankSummaryService(store as unknown as RankSummaryStore),
  };
}

describe('RankSummaryService.summarize', () => {
  it('o gün veri yoksa keyword_rank_latest güncellemez', async () => {
    const { store, service } = setup();
    store.distribution.mockResolvedValue({
      tracked: 0,
      top3: 0,
      top10: 0,
      top20: 0,
      top100: 0,
      avgPosition: null,
      positions: [],
      trackedKeywordIds: [],
    });

    const result = await service.summarize(ORG, PROJECT, DATE);

    expect(result.refreshedKeywordCount).toBe(0);
    expect(store.historyAndBest).not.toHaveBeenCalled();
    expect(store.upsertLatest).not.toHaveBeenCalled();
  });

  it('o gün değişen keyword için upsertLatest çağrılır ve hesap history/best den türer', async () => {
    const { store, service } = setup();
    store.distribution.mockResolvedValue({
      tracked: 1,
      top3: 0,
      top10: 1,
      top20: 1,
      top100: 1,
      avgPosition: 5,
      positions: [5],
      trackedKeywordIds: [KEYWORD],
    });
    store.historyAndBest.mockResolvedValue({
      history: new Map([[KEYWORD, [{ date: DATE, position: 5 }]]]),
      urls: new Map([[KEYWORD, 'https://example.com/page']]),
      existingBest: new Map([[KEYWORD, 8]]),
    });

    const result = await service.summarize(ORG, PROJECT, DATE);

    expect(result.refreshedKeywordCount).toBe(1);
    expect(store.upsertLatest).toHaveBeenCalledWith(
      ORG,
      PROJECT,
      expect.objectContaining({
        trackedKeywordId: KEYWORD,
        position: 5,
        url: 'https://example.com/page',
        bestPosition: 5,
      }),
    );
  });

  it('aynı gün iki kez çalıştırılırsa (idempotent) aynı sonucu üretir', async () => {
    const { store, service } = setup();
    store.distribution.mockResolvedValue({
      tracked: 1,
      top3: 1,
      top10: 1,
      top20: 1,
      top100: 1,
      avgPosition: 2,
      positions: [2],
      trackedKeywordIds: [KEYWORD],
    });
    store.historyAndBest.mockResolvedValue({
      history: new Map([[KEYWORD, [{ date: DATE, position: 2 }]]]),
      urls: new Map([[KEYWORD, 'https://example.com']]),
      existingBest: new Map([[KEYWORD, 2]]),
    });

    const first = await service.summarize(ORG, PROJECT, DATE);
    const second = await service.summarize(ORG, PROJECT, DATE);

    expect(second).toEqual(first);
    expect(store.upsertLatest).toHaveBeenCalledTimes(2);
    expect(store.upsertLatest.mock.calls[0]).toEqual(
      store.upsertLatest.mock.calls[1],
    );
  });
});
