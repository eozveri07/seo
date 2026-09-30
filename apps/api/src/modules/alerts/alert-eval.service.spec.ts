import { QueueName } from '../../infra/queue/queues';
import {
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { JobRunsService } from '../jobs/job-runs.service';
import { RankingsQueryService } from '../rankings/rankings-query.service';
import { SummaryStore } from '../summary/summary-store';
import { AlertEvalService } from './alert-eval.service';
import { AlertEventsStore } from './alert-events.store';
import { AlertRulesService } from './alert-rules.service';
import { AlertRuleType } from './entities/alert-rule.entity';

const ORG = 'org-1';
const PROJECT = 'project-1';
const KEYWORD_ID = 'kw-1';

function baseRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rule-1',
    projectId: PROJECT,
    name: 'Rank düşüşü',
    type: AlertRuleType.RankDrop,
    config: { minDrop: 3, fromTop: 10 },
    channels: ['channel-1'],
    isActive: true,
    cooldownHours: 24,
    ...overrides,
  };
}

function setup() {
  const alertRules = { listActive: jest.fn().mockResolvedValue([baseRule()]) };
  const eventsStore = {
    upsertIfDue: jest.fn().mockResolvedValue({ id: 'event-1', due: true }),
  };
  const trackedKeywords = {
    list: jest.fn().mockResolvedValue({
      items: [{ id: KEYWORD_ID, keyword: 'seo ajansı' }],
      total: 1,
      page: 1,
      limit: 200,
    }),
  };
  const rankingsQuery = {
    latestForKeywords: jest.fn().mockResolvedValue([
      {
        trackedKeywordId: KEYWORD_ID,
        position: 8,
        previousPosition: 3,
        change1d: 5,
        sparkline: [3, 8],
      },
    ]),
  };
  const summaryStore = { range: jest.fn().mockResolvedValue([]) };
  const connectionsService = { listByProject: jest.fn().mockResolvedValue([]) };
  const jobRuns = { lastTwoFailed: jest.fn().mockResolvedValue(false) };
  const projectsService = {
    findOne: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Test Projesi' }),
  };
  const configService = {
    get: jest.fn().mockReturnValue('https://panel.example.com'),
  };
  const notifyQueue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new AlertEvalService(
    alertRules as unknown as AlertRulesService,
    eventsStore as unknown as AlertEventsStore,
    trackedKeywords as never,
    rankingsQuery as unknown as RankingsQueryService,
    summaryStore as unknown as SummaryStore,
    connectionsService as never,
    jobRuns as unknown as JobRunsService,
    projectsService as never,
    configService as never,
    notifyQueue as never,
  );

  return {
    service,
    alertRules,
    eventsStore,
    trackedKeywords,
    rankingsQuery,
    summaryStore,
    connectionsService,
    jobRuns,
    notifyQueue,
  };
}

describe('AlertEvalService.evaluate', () => {
  it('rank_drop: eşik aşılınca tek alert_event üretir ve kanallara notify job ekler', async () => {
    const { service, eventsStore, notifyQueue } = setup();

    await service.evaluate(ORG, PROJECT);

    const upsertCalls = eventsStore.upsertIfDue.mock.calls as [
      {
        orgId: string;
        projectId: string;
        ruleId: string;
        dedupeKey: string;
        cooldownHours: number;
        payload: Record<string, unknown>;
      },
    ][];
    const call = upsertCalls[0][0];
    expect(call.orgId).toBe(ORG);
    expect(call.projectId).toBe(PROJECT);
    expect(call.ruleId).toBe('rule-1');
    expect(call.dedupeKey).toBe(`rank_drop:${KEYWORD_ID}`);
    expect(call.cooldownHours).toBe(24);
    expect(call.payload).toMatchObject({
      keyword: 'seo ajansı',
      previousPosition: 3,
      position: 8,
      alertType: AlertRuleType.RankDrop,
    });
    expect(notifyQueue.add).toHaveBeenCalledWith(
      QueueName.Notify,
      {
        orgId: ORG,
        projectId: PROJECT,
        channelId: 'channel-1',
        alertEventId: 'event-1',
      },
      { jobId: 'notify:event-1:channel-1' },
    );
  });

  it('previousPosition eşik dışındaysa (top N içinde değilse) alert üretmez', async () => {
    const { service, alertRules, eventsStore } = setup();
    alertRules.listActive.mockResolvedValue([
      baseRule({ config: { minDrop: 3, fromTop: 2 } }),
    ]);

    await service.evaluate(ORG, PROJECT);

    expect(eventsStore.upsertIfDue).not.toHaveBeenCalled();
  });

  it('cooldown içindeyse (upsertIfDue due:false) notify job eklenmez', async () => {
    const { service, eventsStore, notifyQueue } = setup();
    eventsStore.upsertIfDue.mockResolvedValue({ id: 'event-1', due: false });

    await service.evaluate(ORG, PROJECT);

    expect(eventsStore.upsertIfDue).toHaveBeenCalled();
    expect(notifyQueue.add).not.toHaveBeenCalled();
  });

  it('sync_failure: error durumundaki bağlantı ve iki ardışık başarısız job için aday üretir', async () => {
    const { service, alertRules, connectionsService, jobRuns, eventsStore } =
      setup();
    alertRules.listActive.mockResolvedValue([
      baseRule({ id: 'rule-2', type: AlertRuleType.SyncFailure, config: {} }),
    ]);
    connectionsService.listByProject.mockResolvedValue([
      {
        id: 'conn-1',
        type: ConnectionType.Gsc,
        status: ConnectionStatus.Error,
        lastError: '403',
      },
    ]);
    jobRuns.lastTwoFailed.mockResolvedValue(true);

    await service.evaluate(ORG, PROJECT);

    const calls = eventsStore.upsertIfDue.mock.calls as [
      { dedupeKey: string },
    ][];
    const dedupeKeys = calls.map((call) => call[0].dedupeKey);
    expect(dedupeKeys).toContain('sync_failure:connection:conn-1');
    expect(dedupeKeys).toContain(`sync_failure:jobs:${QueueName.GscSync}`);
    expect(dedupeKeys).toContain(`sync_failure:jobs:${QueueName.Ga4Sync}`);
  });

  it('aktif kural yoksa hiçbir şey yapmaz', async () => {
    const { service, alertRules, eventsStore, notifyQueue } = setup();
    alertRules.listActive.mockResolvedValue([]);

    await service.evaluate(ORG, PROJECT);

    expect(eventsStore.upsertIfDue).not.toHaveBeenCalled();
    expect(notifyQueue.add).not.toHaveBeenCalled();
  });
});
