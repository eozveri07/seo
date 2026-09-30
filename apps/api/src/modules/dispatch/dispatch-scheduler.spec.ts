import { Queue } from 'bullmq';
import { DispatchJobData } from '../../infra/queue/queues';
import { DispatchScheduler } from './dispatch-scheduler';

describe('DispatchScheduler', () => {
  it("daily-dispatch'i her gün, weekly-dispatch'i pazartesi 04:00 UTC için kaydeder", async () => {
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue({}) };
    const scheduler = new DispatchScheduler(
      queue as unknown as Queue<DispatchJobData>,
    );

    await scheduler.register();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'daily-dispatch',
      { pattern: '0 4 * * *', tz: 'UTC' },
      {
        name: 'daily-dispatch',
        data: {},
        opts: expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }) as object,
      },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-dispatch',
      { pattern: '0 4 * * 1', tz: 'UTC' },
      expect.objectContaining({ name: 'weekly-dispatch', data: {} }),
    );
  });
});
