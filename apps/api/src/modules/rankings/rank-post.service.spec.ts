import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import {
  DfsSerpTaskPostItem,
  DfsSerpTaskPostResult,
  DfsUsageContext,
} from '../../connectors/dataforseo/dataforseo.types';
import {
  ConnectorAuthError,
  ConnectorTransientError,
} from '../../connectors/errors';
import {
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from '../keywords/entities/tracked-keyword.entity';
import {
  RankableKeyword,
  RankableKeywordsService,
} from '../keywords/rankable-keywords.service';
import { RankTaskStatus } from './entities/rank-task.entity';
import { RankDayCompletion } from './rank-day-completion';
import { RankPostService } from './rank-post.service';
import { RankStore } from './rank-store';
import { InMemoryRankStore } from './testing/in-memory-rank-store';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const DATE = '2026-09-28';

function keyword(
  index: number,
  frequency = TrackedKeywordFrequency.Daily,
): RankableKeyword {
  return {
    id: `0190f0e4-0000-7000-8000-${index.toString().padStart(12, '0')}`,
    projectId: PROJECT,
    keyword: `keyword ${index}`,
    device: TrackedKeywordDevice.Desktop,
    locationCode: 2792,
    languageCode: 'tr',
    frequency,
    depth: 20,
  };
}

/** `task_post` yanıtı: tag'ler karışık sırada döner (eşleştirme sıraya güvenmemeli). */
function createdResults(items: DfsSerpTaskPostItem[]): DfsSerpTaskPostResult[] {
  return items
    .map((item) => ({
      id: `dfs-${item.tag}`,
      statusCode: 20100,
      statusMessage: 'Task Created.',
      cost: 0.0006,
      tag: item.tag ?? null,
    }))
    .reverse();
}

function setup(keywords: RankableKeyword[]) {
  const store = new InMemoryRankStore(ORG);
  const keywordsService = {
    listActive: jest.fn(
      (_projectId: string, frequencies: TrackedKeywordFrequency[]) =>
        Promise.resolve(
          keywords.filter((item) => frequencies.includes(item.frequency)),
        ),
    ),
  };
  const serpTaskPost = jest.fn(
    (items: DfsSerpTaskPostItem[], _context?: DfsUsageContext) => {
      void _context;
      return Promise.resolve(createdResults(items));
    },
  );
  const dayCompletion = {
    checkCompleted: jest.fn().mockResolvedValue(true),
  };
  const service = new RankPostService(
    keywordsService as unknown as RankableKeywordsService,
    store as unknown as RankStore,
    { serpTaskPost } as unknown as DataForSeoClient,
    dayCompletion as unknown as RankDayCompletion,
  );
  return { service, store, serpTaskPost, keywordsService, dayCompletion };
}

describe('RankPostService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it("250 keyword'ü 100'lük task_post isteklerine böler ve tag'e tracked_keyword_id yazar", async () => {
    const keywords = Array.from({ length: 250 }, (_, i) => keyword(i + 1));
    const { service, store, serpTaskPost } = setup(keywords);

    const stats = await service.post(ORG, PROJECT, DATE, 'daily', 'run-1');

    expect(serpTaskPost.mock.calls.map(([items]) => items.length)).toEqual([
      100, 100, 50,
    ]);
    const sentTags = serpTaskPost.mock.calls.flatMap(([items]) =>
      items.map((item) => item.tag),
    );
    expect(sentTags).toEqual(keywords.map((item) => item.id));
    expect(serpTaskPost.mock.calls[0][0][0]).toEqual({
      keyword: 'keyword 1',
      locationCode: 2792,
      languageCode: 'tr',
      device: 'desktop',
      depth: 20,
      tag: keywords[0].id,
    });
    expect(serpTaskPost.mock.calls[0][1]).toEqual({
      orgId: ORG,
      projectId: PROJECT,
      jobRunId: 'run-1',
    });

    // Yanıt ters sırada döndü; her satır kendi keyword'ünün task id'sini almalı.
    expect(store.tasks).toHaveLength(250);
    for (const task of store.tasks) {
      expect(task.status).toBe(RankTaskStatus.Posted);
      expect(task.providerTaskId).toBe(`dfs-${task.trackedKeywordId}`);
      expect(task.checkDate).toBe(DATE);
    }
    expect(stats).toEqual({
      projectId: PROJECT,
      date: DATE,
      scope: 'daily',
      candidates: 250,
      skipped: 0,
      posted: 250,
      failed: 0,
    });
  });

  it('aynı gün tekrar dispatch edilince yeni task açmaz ve DataForSEO çağrılmaz', async () => {
    const keywords = Array.from({ length: 40 }, (_, i) => keyword(i + 1));
    const { service, store, serpTaskPost } = setup(keywords);

    await service.post(ORG, PROJECT, DATE, 'daily');
    serpTaskPost.mockClear();
    const again = await service.post(ORG, PROJECT, DATE, 'daily');

    expect(serpTaskPost).not.toHaveBeenCalled();
    expect(store.tasks).toHaveLength(40);
    expect(again).toMatchObject({ candidates: 40, skipped: 40, posted: 0 });
  });

  it('ertesi gün aynı keyword için yeni task açar', async () => {
    const { service, store } = setup([keyword(1)]);

    await service.post(ORG, PROJECT, DATE, 'daily');
    await service.post(ORG, PROJECT, '2026-09-29', 'daily');

    expect(store.tasks.map((task) => task.checkDate)).toEqual([
      DATE,
      '2026-09-29',
    ]);
  });

  it("günlük dispatch: son 7 günde kontrol edilmemiş haftalık keyword'leri de gönderir", async () => {
    const daily = keyword(1);
    const weeklyChecked = keyword(2, TrackedKeywordFrequency.Weekly);
    const weeklyNew = keyword(3, TrackedKeywordFrequency.Weekly);
    const weeklyOld = keyword(4, TrackedKeywordFrequency.Weekly);
    const { service, store, serpTaskPost } = setup([
      daily,
      weeklyChecked,
      weeklyNew,
      weeklyOld,
    ]);
    await store.claimTasks(PROJECT, '2026-09-23', [weeklyChecked.id]);
    await store.claimTasks(PROJECT, '2026-09-21', [weeklyOld.id]);

    await service.post(ORG, PROJECT, DATE, 'daily');

    const sent = serpTaskPost.mock.calls[0][0].map((item) => item.tag);
    expect(sent).toEqual([daily.id, weeklyNew.id, weeklyOld.id]);
  });

  it("haftalık dispatch yalnız haftalık keyword'leri gönderir", async () => {
    const weekly = keyword(2, TrackedKeywordFrequency.Weekly);
    const { service, serpTaskPost, keywordsService } = setup([
      keyword(1),
      weekly,
    ]);

    const stats = await service.post(ORG, PROJECT, DATE, 'weekly');

    expect(keywordsService.listActive).toHaveBeenCalledWith(PROJECT, [
      TrackedKeywordFrequency.Weekly,
    ]);
    expect(serpTaskPost.mock.calls[0][0].map((item) => item.tag)).toEqual([
      weekly.id,
    ]);
    expect(stats).toMatchObject({ scope: 'weekly', posted: 1 });
  });

  it('pazartesi günlük ve haftalık dispatch aynı keyword için tek task açar', async () => {
    const weekly = keyword(2, TrackedKeywordFrequency.Weekly);
    const { service, store, serpTaskPost } = setup([weekly]);

    await service.post(ORG, PROJECT, DATE, 'daily');
    await service.post(ORG, PROJECT, DATE, 'weekly');

    expect(serpTaskPost).toHaveBeenCalledTimes(1);
    expect(store.tasks).toHaveLength(1);
  });

  it("task_post hata verirse gönderilemeyen task'lar failed olur; yeniden denemede tekrar gönderilir", async () => {
    const keywords = Array.from({ length: 150 }, (_, i) => keyword(i + 1));
    const { service, store, serpTaskPost } = setup(keywords);
    serpTaskPost
      .mockImplementationOnce((items) => Promise.resolve(createdResults(items)))
      .mockRejectedValueOnce(new ConnectorTransientError('503'));

    await expect(service.post(ORG, PROJECT, DATE, 'daily')).rejects.toThrow(
      '503',
    );
    expect(
      store.tasks.filter((task) => task.status === RankTaskStatus.Failed),
    ).toHaveLength(50);

    // BullMQ yeniden denemesi: yalnız başarısız 50'si gönderilir.
    serpTaskPost.mockClear();
    const retry = await service.post(ORG, PROJECT, DATE, 'daily');

    expect(serpTaskPost).toHaveBeenCalledTimes(1);
    expect(serpTaskPost.mock.calls[0][0]).toHaveLength(50);
    expect(retry).toMatchObject({ skipped: 100, posted: 50 });
    expect(store.tasks).toHaveLength(150);
    expect(
      store.tasks.every((task) => task.status === RankTaskStatus.Posted),
    ).toBe(true);
  });

  it('auth hatasında job yeniden denenmez', async () => {
    const { service, serpTaskPost } = setup([keyword(1)]);
    serpTaskPost.mockRejectedValueOnce(new ConnectorAuthError('401'));

    await expect(
      service.post(ORG, PROJECT, DATE, 'daily'),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('task-level hata dönen ve yanıtta olmayan keyword failed olur; hiçbiri gönderilemediyse gün kapanır', async () => {
    const [first, second] = [keyword(1), keyword(2)];
    const { service, store, serpTaskPost, dayCompletion } = setup([
      first,
      second,
    ]);
    serpTaskPost.mockResolvedValueOnce([
      {
        id: 'dfs-x',
        statusCode: 40501,
        statusMessage: 'Invalid Field.',
        cost: 0,
        tag: first.id,
      },
    ]);

    const stats = await service.post(ORG, PROJECT, DATE, 'daily');

    expect(stats).toMatchObject({ posted: 0, failed: 2 });
    expect(store.tasks.map((task) => task.error)).toEqual([
      'task_post 40501: Invalid Field.',
      'task_post yanıtında bu keyword yok',
    ]);
    expect(dayCompletion.checkCompleted).toHaveBeenCalledWith(
      ORG,
      PROJECT,
      DATE,
    );
  });
});
