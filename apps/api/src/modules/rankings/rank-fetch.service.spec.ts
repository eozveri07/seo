import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import { DfsSerpAdvancedResult } from '../../connectors/dataforseo/dataforseo.types';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
  ConnectorTransientError,
} from '../../connectors/errors';
import { ProjectsService } from '../clients/projects.service';
import {
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from '../keywords/entities/tracked-keyword.entity';
import { RankableKeywordsService } from '../keywords/rankable-keywords.service';
import { RankSource } from './entities/rank-daily.entity';
import { RankTaskStatus } from './entities/rank-task.entity';
import { RankDayCompletion } from './rank-day-completion';
import { RankFetchService, RankTaskNotReadyError } from './rank-fetch.service';
import { RankStore } from './rank-store';
import { InMemoryRankStore } from './testing/in-memory-rank-store';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const KEYWORD_ID = '0190f0e4-0000-7000-8000-0000000000c1';
const DATE = '2026-09-28';

function serp(
  overrides: Partial<DfsSerpAdvancedResult> = {},
): DfsSerpAdvancedResult {
  return {
    id: 'dfs-1',
    statusCode: 20000,
    statusMessage: 'Ok.',
    cost: 0.002,
    tag: KEYWORD_ID,
    itemTypes: ['organic', 'local_pack'],
    items: [
      {
        type: 'organic',
        rankGroup: 1,
        rankAbsolute: 1,
        domain: 'rakip.com',
        url: 'https://rakip.com/',
        title: null,
      },
      {
        type: 'organic',
        rankGroup: 2,
        rankAbsolute: 3,
        domain: 'www.example.com',
        url: 'https://www.example.com/a',
        title: null,
      },
    ],
    ...overrides,
  };
}

async function setup() {
  const store = new InMemoryRankStore(ORG);
  const [claimed] = await store.claimTasks(PROJECT, DATE, [KEYWORD_ID]);
  await store.setProviderTaskIds([{ id: claimed.id, providerTaskId: 'dfs-1' }]);
  const client = {
    serpTaskGetAdvanced: jest.fn().mockResolvedValue(serp()),
    serpLiveAdvanced: jest.fn().mockResolvedValue(serp({ id: 'live-1' })),
  };
  const keywords = {
    findOne: jest.fn().mockResolvedValue({
      id: KEYWORD_ID,
      projectId: PROJECT,
      keyword: 'seo araçları',
      device: TrackedKeywordDevice.Mobile,
      locationCode: 2792,
      languageCode: 'tr',
      frequency: TrackedKeywordFrequency.Daily,
      depth: 30,
    }),
  };
  const dayCompletion = { checkCompleted: jest.fn().mockResolvedValue(true) };
  const service = new RankFetchService(
    store as unknown as RankStore,
    client as unknown as DataForSeoClient,
    {
      findOne: jest.fn().mockResolvedValue({ domain: 'example.com' }),
    } as unknown as ProjectsService,
    keywords as unknown as RankableKeywordsService,
    dayCompletion as unknown as RankDayCompletion,
  );
  return {
    service,
    store,
    client,
    keywords,
    dayCompletion,
    taskId: claimed.id,
  };
}

describe('RankFetchService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('fetchTask', () => {
    it("sonucu rank_daily'ye yazar, task'ı fetched yapar ve günü kontrol eder", async () => {
      const { service, store, client, dayCompletion, taskId } = await setup();

      const stats = await service.fetchTask(ORG, PROJECT, taskId, 'run-1');

      expect(client.serpTaskGetAdvanced).toHaveBeenCalledWith('dfs-1', {
        orgId: ORG,
        projectId: PROJECT,
        jobRunId: 'run-1',
      });
      expect(store.daily.get(`${DATE}:${KEYWORD_ID}`)).toMatchObject({
        position: 2,
        rankAbsolute: 3,
        url: 'https://www.example.com/a',
        serpFeatures: ['local_pack'],
        competitorsTop: [
          { domain: 'rakip.com', position: 1 },
          { domain: 'www.example.com', position: 2 },
        ],
        source: RankSource.DfsStandard,
      });
      expect(store.tasks[0].status).toBe(RankTaskStatus.Fetched);
      expect(dayCompletion.checkCompleted).toHaveBeenCalledWith(
        ORG,
        PROJECT,
        DATE,
      );
      expect(stats).toMatchObject({ outcome: 'fetched', position: 2 });
    });

    it('domain depth içinde yoksa position null yazılır', async () => {
      const { service, store, client, taskId } = await setup();
      client.serpTaskGetAdvanced.mockResolvedValue(
        serp({ items: serp().items.slice(0, 1) }),
      );

      await service.fetchTask(ORG, PROJECT, taskId);

      expect(store.daily.get(`${DATE}:${KEYWORD_ID}`)).toMatchObject({
        position: null,
        rankAbsolute: null,
        url: null,
      });
    });

    it("zaten çekilmiş task'ı atlar (tekrar çalışan job)", async () => {
      const { service, client, taskId } = await setup();
      await service.fetchTask(ORG, PROJECT, taskId);
      client.serpTaskGetAdvanced.mockClear();

      const stats = await service.fetchTask(ORG, PROJECT, taskId);

      expect(stats.outcome).toBe('skipped');
      expect(client.serpTaskGetAdvanced).not.toHaveBeenCalled();
    });

    it('task henüz kuyruktaysa (40602) yeniden denenmek üzere hata fırlatır', async () => {
      const { service, store, client, taskId } = await setup();
      client.serpTaskGetAdvanced.mockResolvedValue(
        serp({ statusCode: 40602, statusMessage: 'Task In Queue.' }),
      );

      await expect(
        service.fetchTask(ORG, PROJECT, taskId),
      ).rejects.toBeInstanceOf(RankTaskNotReadyError);
      expect(store.tasks[0].status).toBe(RankTaskStatus.Posted);
    });

    it('kalıcı connector hatasında task failed olur, job başarılı biter', async () => {
      const { service, store, client, dayCompletion, taskId } = await setup();
      client.serpTaskGetAdvanced.mockRejectedValue(
        new ConnectorPermanentError('404'),
      );

      const stats = await service.fetchTask(ORG, PROJECT, taskId);

      expect(stats.outcome).toBe('failed');
      expect(store.tasks[0]).toMatchObject({
        status: RankTaskStatus.Failed,
        error: 'task_get: 404',
      });
      expect(dayCompletion.checkCompleted).toHaveBeenCalled();
    });

    it('geçici hata BullMQ yeniden denemesine bırakılır; auth hatası denenmez', async () => {
      const { service, client, taskId } = await setup();
      client.serpTaskGetAdvanced.mockRejectedValueOnce(
        new ConnectorTransientError('503'),
      );
      await expect(service.fetchTask(ORG, PROJECT, taskId)).rejects.toThrow(
        ConnectorTransientError,
      );

      client.serpTaskGetAdvanced.mockRejectedValueOnce(
        new ConnectorAuthError('401'),
      );
      await expect(
        service.fetchTask(ORG, PROJECT, taskId),
      ).rejects.toBeInstanceOf(UnrecoverableError);
    });

    it("başka projenin task'ını işlemez", async () => {
      const { service, client, taskId } = await setup();

      const stats = await service.fetchTask(
        ORG,
        '0190f0e4-0000-7000-8000-0000000000ff',
        taskId,
      );

      expect(stats.outcome).toBe('skipped');
      expect(client.serpTaskGetAdvanced).not.toHaveBeenCalled();
    });
  });

  describe('checkLive', () => {
    it('live/advanced sonucunu source = dfs_live ile o günün satırına yazar', async () => {
      const { service, store, client, keywords } = await setup();

      const stats = await service.checkLive(
        ORG,
        PROJECT,
        KEYWORD_ID,
        '2026-09-30',
        'run-9',
      );

      expect(keywords.findOne).toHaveBeenCalledWith(PROJECT, KEYWORD_ID);
      expect(client.serpLiveAdvanced).toHaveBeenCalledWith(
        {
          keyword: 'seo araçları',
          locationCode: 2792,
          languageCode: 'tr',
          device: 'mobile',
          depth: 30,
          tag: KEYWORD_ID,
        },
        { orgId: ORG, projectId: PROJECT, jobRunId: 'run-9' },
      );
      expect(store.daily.get(`2026-09-30:${KEYWORD_ID}`)).toMatchObject({
        position: 2,
        source: RankSource.DfsLive,
      });
      expect(stats).toEqual({
        trackedKeywordId: KEYWORD_ID,
        date: '2026-09-30',
        position: 2,
        rankAbsolute: 3,
      });
    });

    it('hata durumunda yeniden denenmez (ücretli çağrı)', async () => {
      const { service, client, store } = await setup();
      client.serpLiveAdvanced.mockRejectedValueOnce(
        new ConnectorTransientError('503'),
      );
      await expect(
        service.checkLive(ORG, PROJECT, KEYWORD_ID, '2026-09-30'),
      ).rejects.toBeInstanceOf(UnrecoverableError);

      client.serpLiveAdvanced.mockResolvedValueOnce(
        serp({ statusCode: 40501, statusMessage: 'Invalid Field.' }),
      );
      await expect(
        service.checkLive(ORG, PROJECT, KEYWORD_ID, '2026-09-30'),
      ).rejects.toThrow('live/advanced 40501: Invalid Field.');
      expect(store.daily.size).toBe(0);
    });
  });
});
