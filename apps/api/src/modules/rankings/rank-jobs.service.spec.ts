import { Queue } from 'bullmq';
import { RankFetchJobData, RankPostJobData } from '../../infra/queue/queues';
import { JobRunsService } from '../jobs/job-runs.service';
import { TrackedKeywordFrequency } from '../keywords/entities/tracked-keyword.entity';
import { TrackedKeywordNotFoundError } from '../keywords/keywords.errors';
import { RankableKeywordsService } from '../keywords/rankable-keywords.service';
import { RankJobsService } from './rank-jobs.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const KEYWORD = '0190f0e4-0000-7000-8000-0000000000c1';
const RUN = '0190f0e4-0000-7000-8000-000000000099';

function setup() {
  const postQueue = { add: jest.fn().mockResolvedValue({}) };
  const fetchQueue = { add: jest.fn().mockResolvedValue({}) };
  const keywords = {
    listProjectsForRank: jest
      .fn()
      .mockResolvedValue([{ orgId: ORG, projectId: PROJECT }]),
    findOne: jest.fn().mockResolvedValue({ id: KEYWORD }),
  };
  const jobRuns = {
    createQueued: jest.fn().mockResolvedValue({ id: RUN }),
    attachBullmqJob: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RankJobsService(
    postQueue as unknown as Queue<RankPostJobData>,
    fetchQueue as unknown as Queue<RankFetchJobData>,
    keywords as unknown as RankableKeywordsService,
    jobRuns as unknown as JobRunsService,
  );
  return { service, postQueue, fetchQueue, keywords, jobRuns };
}

describe('RankJobsService', () => {
  it("daily-dispatch: günlük ya da haftalık keyword'ü olan projeye deterministik rank-post ekler", async () => {
    const { service, postQueue, keywords } = setup();

    const [item] = await service.collect('2026-09-28');
    await item.enqueue();

    expect(keywords.listProjectsForRank).toHaveBeenCalledWith([
      TrackedKeywordFrequency.Daily,
      TrackedKeywordFrequency.Weekly,
    ]);
    expect(item).toMatchObject({
      orgId: ORG,
      projectId: PROJECT,
      kind: 'rank-post-daily',
    });
    expect(postQueue.add).toHaveBeenCalledWith(
      'rank-post',
      {
        orgId: ORG,
        projectId: PROJECT,
        date: '2026-09-28',
        scope: 'daily',
        trigger: 'schedule',
      },
      { jobId: `rank-post-daily:${PROJECT}:2026-09-28`, priority: 1 },
    );
  });

  it("weekly-dispatch: yalnız haftalık keyword'ü olan projeler, ayrı jobId", async () => {
    const { service, postQueue, keywords } = setup();

    const [item] = await service.collectWeekly('2026-09-28');
    await item.enqueue();

    expect(keywords.listProjectsForRank).toHaveBeenCalledWith([
      TrackedKeywordFrequency.Weekly,
    ]);
    expect(postQueue.add).toHaveBeenCalledWith(
      'rank-post',
      expect.objectContaining({ scope: 'weekly' }),
      expect.objectContaining({
        jobId: `rank-post-weekly:${PROJECT}:2026-09-28`,
      }),
    );
  });

  it("check-now: job_runs kaydı açar, live job'u yeniden denemesiz ekler ve runId döner", async () => {
    const { service, fetchQueue, jobRuns } = setup();

    const runId = await service.triggerCheckNow(
      ORG,
      PROJECT,
      KEYWORD,
      '2026-09-30',
    );

    expect(runId).toBe(RUN);
    expect(jobRuns.createQueued).toHaveBeenCalledWith({
      type: 'rank-live',
      projectId: PROJECT,
      trigger: 'manual',
    });
    expect(fetchQueue.add).toHaveBeenCalledWith(
      'rank-live',
      {
        kind: 'live',
        orgId: ORG,
        projectId: PROJECT,
        trackedKeywordId: KEYWORD,
        date: '2026-09-30',
        runId: RUN,
        trigger: 'manual',
      },
      { jobId: `rank-live:${PROJECT}:${RUN}`, attempts: 1, priority: 1 },
    );
    expect(jobRuns.attachBullmqJob).toHaveBeenCalledWith(
      RUN,
      `rank-live:${PROJECT}:${RUN}`,
    );
  });

  it('check-now: keyword projede yoksa kayıt açmadan 404 fırlatır', async () => {
    const { service, keywords, jobRuns, fetchQueue } = setup();
    keywords.findOne.mockRejectedValue(new TrackedKeywordNotFoundError());

    await expect(
      service.triggerCheckNow(ORG, PROJECT, KEYWORD, '2026-09-30'),
    ).rejects.toBeInstanceOf(TrackedKeywordNotFoundError);
    expect(jobRuns.createQueued).not.toHaveBeenCalled();
    expect(fetchQueue.add).not.toHaveBeenCalled();
  });

  it('check-now: kuyruğa eklenemezse kayıt failed kapanır', async () => {
    const { service, fetchQueue, jobRuns } = setup();
    fetchQueue.add.mockRejectedValue(new Error('redis'));

    await expect(
      service.triggerCheckNow(ORG, PROJECT, KEYWORD, '2026-09-30'),
    ).rejects.toThrow('redis');
    expect(jobRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN, queueName: 'rank-fetch' }),
      expect.any(Error),
      true,
    );
  });
});
