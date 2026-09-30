import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { RANK_DAY_COMPLETED_EVENT } from '../../common/events/rank-day-completed.event';
import { EnvironmentVariables } from '../../config/environment-variables';
import { serpTaskGetAdvancedFixture } from '../../connectors/dataforseo/__fixtures__/serp-task-get-advanced.fixture';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import { RankFetchJobData } from '../../infra/queue/queues';
import { ProjectsService } from '../clients/projects.service';
import {
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from '../keywords/entities/tracked-keyword.entity';
import {
  RankableKeyword,
  RankableKeywordsService,
} from '../keywords/rankable-keywords.service';
import { UsageService } from '../usage/usage.service';
import { RankSource } from './entities/rank-daily.entity';
import { RankTaskStatus } from './entities/rank-task.entity';
import { RankDayCompletion } from './rank-day-completion';
import { RankFetchService } from './rank-fetch.service';
import { RankPollService } from './rank-poll.service';
import { RankPostService } from './rank-post.service';
import { RankStore } from './rank-store';
import { InMemoryRankStore } from './testing/in-memory-rank-store';

/**
 * Post → poll → fetch zinciri uçtan uca (DB ve Redis yerine bellek içi
 * store ve kuyruk; DataForSEO yerine gerçek `DataForSeoClient` + sahte
 * `fetch`). DataForSEO yanıtları dokümantasyondaki biçimdedir.
 */

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const DATE = '2026-09-28';
/** Bu keyword'ün SERP'i "No Search Results" döner. */
const EMPTY_SERP_INDEX = 40;

function keyword(index: number): RankableKeyword {
  return {
    id: `0190f0e4-0000-7000-8000-${index.toString().padStart(12, '0')}`,
    projectId: PROJECT,
    keyword: `keyword ${index}`,
    device: TrackedKeywordDevice.Mobile,
    locationCode: 2792,
    languageCode: 'tr',
    frequency: TrackedKeywordFrequency.Daily,
    depth: 20,
  };
}

function json(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function envelope(tasks: unknown[]) {
  return {
    version: '0.1.20250923',
    status_code: 20000,
    status_message: 'Ok.',
    time: '0.1 sec.',
    cost: 0,
    tasks_count: tasks.length,
    tasks_error: 0,
    tasks,
  };
}

function task(id: string, statusCode: number, extra: object = {}) {
  return {
    id,
    status_code: statusCode,
    status_message: statusCode === 20100 ? 'Task Created.' : 'Ok.',
    time: '0.01 sec.',
    cost: statusCode === 20100 ? 0.0006 : 0,
    result_count: 0,
    path: [],
    data: null,
    result: null,
    ...extra,
  };
}

/** Sahte DataForSEO: task_post task açar, tasks_ready hepsini hazır gösterir. */
function fakeDataForSeo() {
  const posted = new Map<string, string>(); // task id -> tag
  let nextId = 1;
  const fetchFn = jest.fn((url: string, init: RequestInit) => {
    if (url.endsWith('/serp/google/organic/task_post')) {
      const body = JSON.parse(init.body as string) as { tag: string }[];
      const tasks = body.map((item) => {
        const id = `09281234-1535-0066-0000-${(nextId++).toString().padStart(12, '0')}`;
        posted.set(id, item.tag);
        return task(id, 20100, { data: { ...item } });
      });
      return Promise.resolve(json(envelope(tasks)));
    }
    if (url.endsWith('/serp/google/organic/tasks_ready')) {
      const ready = [...posted.entries()].map(([id, tag]) => ({
        id,
        se: 'google',
        se_type: 'organic',
        date_posted: '2026-09-28 04:00:02 +00:00',
        tag,
        endpoint_regular: null,
        endpoint_advanced: `/v3/serp/google/organic/task_get/advanced/${id}`,
        endpoint_html: null,
      }));
      // Aynı DataForSEO hesabından başka bir sistemin task'ı: yok sayılmalı.
      ready.push({ ...ready[0], id: 'foreign-task', tag: 'foreign' });
      return Promise.resolve(
        json(envelope([task('ready', 20000, { result: ready })])),
      );
    }
    const match = /task_get\/advanced\/(.+)$/.exec(url);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const tag = posted.get(id) ?? null;
      if (tag === keyword(EMPTY_SERP_INDEX).id) {
        return Promise.resolve(
          json(
            envelope([
              {
                ...task(id, 40102),
                status_message: 'No Search Results.',
                data: { tag },
              },
            ]),
          ),
        );
      }
      const fixture = serpTaskGetAdvancedFixture();
      fixture.tasks[0] = { ...fixture.tasks[0], id };
      fixture.tasks[0].data = { ...fixture.tasks[0].data, tag: tag as string };
      return Promise.resolve(json(fixture));
    }
    return Promise.reject(new Error(`beklenmeyen URL: ${url}`));
  });
  return { fetchFn, posted };
}

function setup() {
  const keywords = Array.from({ length: 40 }, (_, i) => keyword(i + 1));
  const store = new InMemoryRankStore(ORG);
  const rankStore = store as unknown as RankStore;
  const { fetchFn } = fakeDataForSeo();
  const usage = { record: jest.fn().mockResolvedValue(undefined) };
  const client = new DataForSeoClient(
    {
      get: (key: string) =>
        ({ DFS_LOGIN: 'login', DFS_PASSWORD: 'secret' })[key],
    } as unknown as ConfigService<EnvironmentVariables, true>,
    usage as unknown as UsageService,
    {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: () => Promise.resolve(),
    },
  );
  const keywordsService = {
    listActive: jest.fn().mockResolvedValue(keywords),
    findOne: jest.fn((_projectId: string, id: string) =>
      Promise.resolve(keywords.find((item) => item.id === id)),
    ),
  } as unknown as RankableKeywordsService;
  const projects = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: PROJECT, domain: 'example.com' }),
  } as unknown as ProjectsService;
  const events = { emit: jest.fn() };
  const dayCompletion = new RankDayCompletion(
    rankStore,
    events as unknown as EventEmitter2,
  );
  const cls = {
    run: (_options: unknown, fn: () => unknown) => fn(),
    set: jest.fn(),
  } as unknown as ClsService<AppClsStore>;
  const fetchJobs: { data: RankFetchJobData; opts: { jobId: string } }[] = [];
  const fetchQueue = {
    addBulk: jest.fn(
      (jobs: { data: RankFetchJobData; opts: { jobId: string } }[]) => {
        // BullMQ: aynı jobId ikinci kez eklenmez.
        for (const job of jobs) {
          if (!fetchJobs.some((item) => item.opts.jobId === job.opts.jobId)) {
            fetchJobs.push(job);
          }
        }
        return Promise.resolve([]);
      },
    ),
  } as unknown as Queue<RankFetchJobData>;

  const post = new RankPostService(
    keywordsService,
    rankStore,
    client,
    dayCompletion,
  );
  const poll = new RankPollService(
    rankStore,
    client,
    dayCompletion,
    cls,
    fetchQueue,
  );
  const fetchService = new RankFetchService(
    rankStore,
    client,
    projects,
    keywordsService,
    dayCompletion,
  );

  async function runFetchJobs(): Promise<void> {
    for (const job of fetchJobs.splice(0)) {
      if (job.data.kind === 'task') {
        await fetchService.fetchTask(
          job.data.orgId,
          job.data.projectId,
          job.data.rankTaskId,
        );
      }
    }
  }

  return {
    keywords,
    store,
    fetchFn,
    usage,
    events,
    fetchJobs,
    post,
    poll,
    fetchService,
    runFetchJobs,
  };
}

function calls(fetchFn: jest.Mock, suffix: string): number {
  return fetchFn.mock.calls.filter(([url]) => (url as string).includes(suffix))
    .length;
}

describe('rank tracking zinciri (post → poll → fetch)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it("40 keyword'ün sonucu rank_daily'ye düşer, gün bitince rank.day_completed yayılır", async () => {
    const ctx = setup();

    const postStats = await ctx.post.post(ORG, PROJECT, DATE, 'daily', 'run-1');
    expect(postStats).toMatchObject({ posted: 40, failed: 0 });
    expect(calls(ctx.fetchFn, '/task_post')).toBe(1);
    expect(ctx.store.tasks.every((t) => t.providerTaskId !== null)).toBe(true);

    const pollStats = await ctx.poll.poll(new Date('2026-09-28T04:10:00Z'));
    expect(pollStats).toEqual({ staleDays: 0, ready: 41, enqueued: 40 });
    expect(ctx.fetchJobs).toHaveLength(40);
    const firstTask = ctx.store.tasks[0];
    expect(ctx.fetchJobs[0]).toMatchObject({
      data: {
        kind: 'task',
        orgId: ORG,
        projectId: PROJECT,
        rankTaskId: firstTask.id,
      },
      opts: { jobId: `rank-fetch:${PROJECT}:${firstTask.providerTaskId}` },
    });
    expect(
      ctx.store.tasks.every((t) => t.status === RankTaskStatus.Ready),
    ).toBe(true);

    await ctx.runFetchJobs();

    expect(ctx.store.daily.size).toBe(39);
    const row = ctx.store.daily.get(`${DATE}:${ctx.keywords[0].id}`);
    expect(row).toMatchObject({
      date: DATE,
      orgId: ORG,
      projectId: PROJECT,
      trackedKeywordId: ctx.keywords[0].id,
      position: 3,
      rankAbsolute: 6,
      url: 'https://blog.example.com/seo-araclari/',
      serpFeatures: ['paid', 'featured_snippet', 'people_also_ask'],
      source: RankSource.DfsStandard,
    });
    expect(row?.competitorsTop).toHaveLength(10);
    expect(row?.competitorsTop.slice(0, 4)).toEqual([
      { domain: 'tr.wikipedia.org', position: 1 },
      { domain: 'www.notexample.com', position: 2 },
      { domain: 'blog.example.com', position: 3 },
      { domain: 'www.example.com', position: 4 },
    ]);

    const statuses = ctx.store.tasks.map((t) => t.status);
    expect(statuses.filter((s) => s === RankTaskStatus.Fetched)).toHaveLength(
      39,
    );
    const empty = ctx.store.tasks.find(
      (t) => t.trackedKeywordId === ctx.keywords[EMPTY_SERP_INDEX - 1].id,
    );
    expect(empty).toMatchObject({
      status: RankTaskStatus.Failed,
      error: 'task_get 40102: No Search Results.',
    });

    // Gün yalnız son task kapandığında, bir kez tamamlanır.
    expect(ctx.events.emit).toHaveBeenCalledTimes(1);
    expect(ctx.events.emit).toHaveBeenCalledWith(
      RANK_DAY_COMPLETED_EVENT,
      expect.objectContaining({ orgId: ORG, projectId: PROJECT, date: DATE }),
    );

    // Maliyet: task_post (1 istek) + tasks_ready + 40 task_get kaydedildi.
    expect(ctx.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'serp/google/organic/task_post',
        units: 40,
        orgId: ORG,
        projectId: PROJECT,
        jobRunId: 'run-1',
      }),
    );
    expect(calls(ctx.fetchFn, '/task_get/advanced/')).toBe(40);
  });

  it('aynı gün tekrar dispatch ve tekrar poll yeni task ya da fetch açmaz', async () => {
    const ctx = setup();
    await ctx.post.post(ORG, PROJECT, DATE, 'daily');
    await ctx.poll.poll(new Date('2026-09-28T04:10:00Z'));
    await ctx.runFetchJobs();

    const again = await ctx.post.post(ORG, PROJECT, DATE, 'daily');
    const repoll = await ctx.poll.poll(new Date('2026-09-28T04:12:00Z'));

    expect(again).toMatchObject({ skipped: 40, posted: 0 });
    expect(calls(ctx.fetchFn, '/task_post')).toBe(1);
    expect(ctx.store.tasks).toHaveLength(40);
    expect(repoll.enqueued).toBe(0);
    expect(ctx.fetchJobs).toHaveLength(0);
  });

  it("24 saatte hazır olmayan task'lar failed olur, gün kapanır ve ertesi dispatch yeniden gönderir", async () => {
    const ctx = setup();
    const postedAt = new Date();
    await ctx.post.post(ORG, PROJECT, DATE, 'daily');

    const stats = await ctx.poll.poll(
      new Date(postedAt.getTime() + 25 * 3_600_000),
    );

    expect(stats.staleDays).toBe(1);
    expect(stats.enqueued).toBe(0);
    expect(
      ctx.store.tasks.every(
        (t) =>
          t.status === RankTaskStatus.Failed &&
          t.error === '24 saat içinde hazır olmadı',
      ),
    ).toBe(true);
    expect(ctx.events.emit).toHaveBeenCalledWith(
      RANK_DAY_COMPLETED_EVENT,
      expect.objectContaining({ date: DATE }),
    );

    const nextDay = await ctx.post.post(ORG, PROJECT, '2026-09-29', 'daily');
    expect(nextDay).toMatchObject({ posted: 40 });
  });
});
