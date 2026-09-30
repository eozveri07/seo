import { Queue } from 'bullmq';
import { RankPollJobData } from '../../infra/queue/queues';
import { RankPollScheduler } from './rank-poll-scheduler';

describe('RankPollScheduler', () => {
  it("rank-poll'u 2 dakikada bir çalışacak şekilde upsertJobScheduler ile kaydeder", async () => {
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue({}) };
    const scheduler = new RankPollScheduler(
      queue as unknown as Queue<RankPollJobData>,
    );

    await scheduler.register();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'rank-poll',
      { every: 120_000 },
      expect.objectContaining({
        name: 'rank-poll',
        data: {},
        opts: expect.objectContaining({ attempts: 3 }) as object,
      }),
    );
  });
});
