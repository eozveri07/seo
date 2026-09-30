import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { RankDayCompletedEvent } from '../../common/events/rank-day-completed.event';
import { SyncCompletedEvent } from '../../common/events/sync-completed.event';
import { SummaryJobsService } from './summary-jobs.service';
import { SummaryTriggerListener } from './summary-trigger.listener';

function buildListener() {
  const store = new Map<string, unknown>();
  const cls = {
    run: <T>(_options: unknown, callback: () => T): T => callback(),
    set: (key: string, value: unknown) => store.set(key, value),
  } as unknown as ClsService<AppClsStore>;
  const orgIdsSeen: unknown[] = [];
  const summaryJobs = {
    enqueue: jest.fn(() => {
      orgIdsSeen.push(store.get('orgId'));
      return Promise.resolve(undefined);
    }),
  };
  const listener = new SummaryTriggerListener(
    summaryJobs as unknown as SummaryJobsService,
    cls,
  );
  return { listener, summaryJobs, orgIdsSeen };
}

describe('SummaryTriggerListener', () => {
  it("sync.completed ta event'in org'u kapsamında summary job'u ekler", async () => {
    const { listener, summaryJobs, orgIdsSeen } = buildListener();

    await listener.onSyncCompleted(
      new SyncCompletedEvent('org-1', 'project-1', '2026-09-28', 'gsc'),
    );

    expect(summaryJobs.enqueue).toHaveBeenCalledWith(
      'org-1',
      'project-1',
      '2026-09-28',
    );
    expect(orgIdsSeen).toEqual(['org-1']);
  });

  it('rank.day_completed ta summary job u ekler', async () => {
    const { listener, summaryJobs } = buildListener();

    await listener.onRankDayCompleted(
      new RankDayCompletedEvent('org-1', 'project-1', '2026-09-28'),
    );

    expect(summaryJobs.enqueue).toHaveBeenCalledWith(
      'org-1',
      'project-1',
      '2026-09-28',
    );
  });

  it('job eklenemezse hatayı yutar (event akışı bozulmaz)', async () => {
    const { listener, summaryJobs } = buildListener();
    summaryJobs.enqueue.mockRejectedValue(new Error('redis yok'));

    await expect(
      listener.onSyncCompleted(
        new SyncCompletedEvent('org-1', 'project-1', '2026-09-28', 'ga4'),
      ),
    ).resolves.toBeUndefined();
  });
});
