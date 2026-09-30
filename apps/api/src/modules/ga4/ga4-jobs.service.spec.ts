import { Queue } from 'bullmq';
import { Ga4SyncJobData, JobTrigger } from '../../infra/queue/queues';
import { ConnectionsService } from '../connections/connections.service';
import {
  Connection,
  ConnectionBackfillStatus,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { JobRunsService } from '../jobs/job-runs.service';
import { GA4_BACKFILL_JOB_NAME, Ga4JobsService } from './ga4-jobs.service';
import { Ga4ConnectionNotActiveError } from './ga4.errors';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const OTHER_PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000f';
const CONNECTION_ID = '0190f0e4-0000-7000-8000-000000000020';
const RUN_ID = '0190f0e4-0000-7000-8000-000000000099';

function buildConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: CONNECTION_ID,
    orgId: 'org-1',
    projectId: PROJECT_ID,
    type: ConnectionType.Ga4,
    status: ConnectionStatus.Active,
    backfillStatus: ConnectionBackfillStatus.Pending,
    ...overrides,
  } as Connection;
}

function buildService(connection: Connection | null = buildConnection()) {
  const syncQueue = {
    add: jest.fn().mockResolvedValue({ id: 'x' }),
    addBulk: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(1),
  };
  const connectionsService = {
    findByProjectAndType: jest.fn().mockResolvedValue(connection),
    listActiveForDispatch: jest.fn().mockResolvedValue([
      { connectionId: 'c1', orgId: 'org-1', projectId: PROJECT_ID },
      { connectionId: 'c2', orgId: 'org-2', projectId: OTHER_PROJECT_ID },
    ]),
    startBackfill: jest.fn().mockResolvedValue(undefined),
  };
  const jobRuns = {
    createQueued: jest.fn().mockResolvedValue({ id: RUN_ID }),
    attachBullmqJob: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new Ga4JobsService(
    syncQueue as unknown as Queue<Ga4SyncJobData>,
    connectionsService as unknown as ConnectionsService,
    jobRuns as unknown as JobRunsService,
  );
  return { service, syncQueue, connectionsService, jobRuns };
}

describe('Ga4JobsService', () => {
  describe('collect (daily-dispatch)', () => {
    it("her aktif proje için deterministik jobId'li, yüksek öncelikli sync ekler", async () => {
      const { service, syncQueue } = buildService();

      const items = await service.collect('2026-09-30');
      for (const item of items) {
        await item.enqueue();
      }
      const again = await service.collect('2026-09-30');
      for (const item of again) {
        await item.enqueue();
      }

      expect(items.map((i) => [i.orgId, i.projectId])).toEqual([
        ['org-1', PROJECT_ID],
        ['org-2', OTHER_PROJECT_ID],
      ]);
      expect(syncQueue.add).toHaveBeenNthCalledWith(
        1,
        'ga4-sync',
        {
          orgId: 'org-1',
          projectId: PROJECT_ID,
          date: '2026-09-30',
          trigger: JobTrigger.Schedule,
        },
        { jobId: `ga4-sync:${PROJECT_ID}:2026-09-30`, priority: 1 },
      );
      const jobIds = syncQueue.add.mock.calls.map(
        ([, , opts]: [string, unknown, { jobId: string }]) => opts.jobId,
      );
      expect(jobIds.slice(0, 2)).toEqual(jobIds.slice(2));
    });
  });

  describe('triggerManualSync', () => {
    it('queued job_runs kaydı açar, runId ile job ekler ve runId döner', async () => {
      const { service, syncQueue, jobRuns } = buildService();

      const runId = await service.triggerManualSync(
        'org-1',
        PROJECT_ID,
        '2026-09-30',
      );

      expect(runId).toBe(RUN_ID);
      expect(jobRuns.createQueued).toHaveBeenCalledWith({
        type: 'ga4-sync',
        projectId: PROJECT_ID,
        trigger: JobTrigger.Manual,
      });
      const jobId = `ga4-sync-manual:${PROJECT_ID}:${RUN_ID}`;
      expect(syncQueue.add).toHaveBeenCalledWith(
        'ga4-sync',
        {
          orgId: 'org-1',
          projectId: PROJECT_ID,
          date: '2026-09-30',
          runId: RUN_ID,
          trigger: JobTrigger.Manual,
        },
        { jobId, priority: 1 },
      );
      expect(jobRuns.attachBullmqJob).toHaveBeenCalledWith(RUN_ID, jobId);
    });

    it.each([
      ['yoksa', null],
      ['pending ise', buildConnection({ status: ConnectionStatus.Pending })],
    ])(
      'bağlantı %s GA4_CONNECTION_NOT_ACTIVE fırlatır',
      async (_label, connection) => {
        const { service, syncQueue, jobRuns } = buildService(connection);

        await expect(
          service.triggerManualSync('org-1', PROJECT_ID, '2026-09-30'),
        ).rejects.toBeInstanceOf(Ga4ConnectionNotActiveError);
        expect(jobRuns.createQueued).not.toHaveBeenCalled();
        expect(syncQueue.add).not.toHaveBeenCalled();
      },
    );

    it('kuyruğa eklenemezse kaydı failed kapatır', async () => {
      const { service, syncQueue, jobRuns } = buildService();
      syncQueue.add.mockRejectedValue(new Error('redis yok'));

      await expect(
        service.triggerManualSync('org-1', PROJECT_ID, '2026-09-30'),
      ).rejects.toThrow('redis yok');
      expect(jobRuns.fail).toHaveBeenCalledWith(
        expect.objectContaining({ runId: RUN_ID }),
        expect.any(Error),
        true,
      );
    });
  });

  describe('startBackfill', () => {
    it("14 ay geriye gün gün, düşük öncelikli job'lar ekler ve ilerlemeyi başlatır", async () => {
      const { service, syncQueue, connectionsService } = buildService();

      const plan = await service.startBackfill(
        'org-1',
        PROJECT_ID,
        '2026-09-30',
      );

      expect(plan).toEqual({
        from: '2025-07-30',
        to: '2026-09-29',
        total: 427,
      });
      expect(connectionsService.startBackfill).toHaveBeenCalledWith(
        CONNECTION_ID,
        { from: '2025-07-30', to: '2026-09-29', total: 427, done: 0 },
      );
      const [jobs] = syncQueue.addBulk.mock.calls[0] as [
        {
          name: string;
          data: Ga4SyncJobData;
          opts: { jobId: string; priority: number };
        }[],
      ];
      expect(jobs).toHaveLength(427);
      expect(jobs[0]).toEqual({
        name: GA4_BACKFILL_JOB_NAME,
        data: {
          orgId: 'org-1',
          projectId: PROJECT_ID,
          date: '2026-09-29',
          trigger: JobTrigger.System,
        },
        opts: { jobId: `ga4-backfill:${PROJECT_ID}:2026-09-29`, priority: 10 },
      });
      expect(jobs[jobs.length - 1].data.date).toBe('2025-07-30');
      expect(new Set(jobs.map((j) => j.opts.jobId)).size).toBe(427);
      expect(syncQueue.remove).not.toHaveBeenCalled();
    });

    it("yeniden başlatmada eski backfill job'larını silip yeniden ekler", async () => {
      const { service, syncQueue } = buildService(
        buildConnection({ backfillStatus: ConnectionBackfillStatus.Failed }),
      );

      await service.startBackfill('org-1', PROJECT_ID, '2026-09-30');

      expect(syncQueue.remove).toHaveBeenCalledTimes(427);
      expect(syncQueue.remove).toHaveBeenCalledWith(
        `ga4-backfill:${PROJECT_ID}:2026-09-29`,
      );
      expect(syncQueue.addBulk).toHaveBeenCalled();
    });

    it.each([
      [
        'bitmişse',
        buildConnection({ backfillStatus: ConnectionBackfillStatus.Done }),
      ],
      ['aktif değilse', buildConnection({ status: ConnectionStatus.Error })],
      ['yoksa', null],
    ])('bağlantı %s backfill başlamaz', async (_label, connection) => {
      const { service, syncQueue, connectionsService } =
        buildService(connection);

      const plan = await service.startBackfill(
        'org-1',
        PROJECT_ID,
        '2026-09-30',
      );

      expect(plan).toBeNull();
      expect(syncQueue.addBulk).not.toHaveBeenCalled();
      expect(connectionsService.startBackfill).not.toHaveBeenCalled();
    });
  });
});
