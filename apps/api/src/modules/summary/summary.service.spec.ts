import { Queue } from 'bullmq';
import { QueueName } from '../../infra/queue/queues';
import { GscQueryService } from '../gsc/gsc-query.service';
import { Ga4QueryService } from '../ga4/ga4-query.service';
import { RankSummaryService } from '../rankings/rank-summary.service';
import { SummaryStore } from './summary-store';
import { SummaryService } from './summary.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const DATE = '2026-09-28';

function setup() {
  const store = {
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const gscQuery = {
    dayTotals: jest.fn().mockResolvedValue({
      clicks: 100,
      impressions: 1000,
      ctr: 0.1,
      position: 8,
    }),
  };
  const ga4Query = {
    organicDayTotals: jest
      .fn()
      .mockResolvedValue({ sessions: 50, keyEvents: 5 }),
  };
  const rankSummary = {
    summarize: jest.fn().mockResolvedValue({
      tracked: 2,
      top3: 1,
      top10: 2,
      top20: 2,
      top100: 2,
      avgPosition: 3,
      positions: [1, 5],
      trackedKeywordIds: ['kw-1', 'kw-2'],
      refreshedKeywordCount: 2,
    }),
  };
  const alertEvalQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SummaryService(
    store as unknown as SummaryStore,
    gscQuery as unknown as GscQueryService,
    ga4Query as unknown as Ga4QueryService,
    rankSummary as unknown as RankSummaryService,
    alertEvalQueue as unknown as Queue,
  );
  return { store, gscQuery, ga4Query, rankSummary, alertEvalQueue, service };
}

describe('SummaryService.compute', () => {
  it('GSC/GA4/rank verisinden project_daily_summary upsert eder', async () => {
    const { store, service } = setup();

    await service.compute(ORG, PROJECT, DATE);

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        projectId: PROJECT,
        date: DATE,
        gscClicks: 100,
        organicSessions: 50,
        organicKeyEvents: 5,
        kwTracked: 2,
        kwTop3: 1,
        kwAvgPosition: 3,
      }),
    );
  });

  it('bitince alert-eval job u deterministik jobId ile eklenir', async () => {
    const { alertEvalQueue, service } = setup();

    await service.compute(ORG, PROJECT, DATE);

    expect(alertEvalQueue.add).toHaveBeenCalledWith(
      QueueName.AlertEval,
      expect.objectContaining({ orgId: ORG, projectId: PROJECT }),
      expect.objectContaining({ jobId: `alert-eval:${PROJECT}:${DATE}` }),
    );
  });

  it('pozisyonlardan 0-100 arası bir visibility skoru hesaplar', async () => {
    const { service } = setup();

    const result = await service.compute(ORG, PROJECT, DATE);

    expect(result.visibilityScore).toBeGreaterThan(0);
    expect(result.visibilityScore).toBeLessThanOrEqual(100);
  });

  it('aynı gün iki kez çalıştırılırsa (idempotent) aynı upsert verisini üretir', async () => {
    const { store, service } = setup();

    await service.compute(ORG, PROJECT, DATE);
    await service.compute(ORG, PROJECT, DATE);

    expect(store.upsert).toHaveBeenCalledTimes(2);
    expect(store.upsert.mock.calls[0]).toEqual(store.upsert.mock.calls[1]);
  });
});
