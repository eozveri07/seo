import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { JobTrigger, QueueName } from '../../infra/queue/queues';
import { JobRun, JobRunStatus } from './entities/job-run.entity';
import { JobRunsService } from './job-runs.service';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function buildService(updateAffected = 1) {
  const runs = {
    save: jest.fn((entity: Partial<JobRun>) =>
      Promise.resolve({ id: entity.id ?? 'run-generated', ...entity }),
    ),
    update: jest.fn().mockResolvedValue({ affected: updateAffected }),
    findOneBy: jest.fn(),
  };
  const service = new JobRunsService(
    runs as unknown as TenantRepository<JobRun>,
  );
  return { service, runs };
}

const baseContext = {
  queueName: QueueName.GscSync,
  jobId: `gsc-sync:${PROJECT_ID}:2026-09-30`,
  orgId: 'org-1',
  projectId: PROJECT_ID,
  trigger: JobTrigger.Schedule,
};

describe('JobRunsService', () => {
  it('createQueued manuel tetikleme için queued kayıt açar', async () => {
    const { service, runs } = buildService();

    await service.createQueued({
      type: QueueName.GscSync,
      projectId: PROJECT_ID,
      trigger: JobTrigger.Manual,
    });

    expect(runs.save).toHaveBeenCalledWith({
      type: 'gsc-sync',
      projectId: PROJECT_ID,
      trigger: 'manual',
      status: JobRunStatus.Queued,
    });
  });

  it('start runId yoksa running bir kayıt açar ve id döner', async () => {
    const { service, runs } = buildService();

    const runId = await service.start(baseContext);

    expect(runId).toEqual(expect.any(String));
    expect(runs.update).not.toHaveBeenCalled();
    expect(runs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: runId,
        type: 'gsc-sync',
        status: JobRunStatus.Running,
        trigger: JobTrigger.Schedule,
        bullmqJobId: baseContext.jobId,
        startedAt: expect.any(Date) as Date,
      }),
    );
  });

  it('start runId varsa aynı kaydı running yapar (manuel ya da yeniden deneme)', async () => {
    const { service, runs } = buildService();

    const runId = await service.start({ ...baseContext, runId: 'run-1' });

    expect(runId).toBe('run-1');
    expect(runs.update).toHaveBeenCalledWith(
      { id: 'run-1' },
      expect.objectContaining({
        status: JobRunStatus.Running,
        finishedAt: null,
      }),
    );
    expect(runs.save).not.toHaveBeenCalled();
  });

  it('succeed kaydı stats ile kapatır', async () => {
    const { service, runs } = buildService();

    await service.succeed({ ...baseContext, runId: 'run-1' }, { rows: 10 });

    expect(runs.update).toHaveBeenCalledWith(
      { id: 'run-1' },
      expect.objectContaining({
        status: JobRunStatus.Succeeded,
        finishedAt: expect.any(Date) as Date,
        stats: { rows: 10 },
        error: null,
      }),
    );
  });

  it('fail son denemede failed, değilse queued yazar', async () => {
    const { service, runs } = buildService();
    const context = { ...baseContext, runId: 'run-1' };

    await service.fail(context, new Error('429'), false);
    await service.fail(context, new Error('403'), true);

    expect(runs.update).toHaveBeenNthCalledWith(
      1,
      { id: 'run-1' },
      { status: JobRunStatus.Queued, finishedAt: null, error: '429' },
    );
    expect(runs.update).toHaveBeenNthCalledWith(
      2,
      { id: 'run-1' },
      expect.objectContaining({ status: JobRunStatus.Failed, error: '403' }),
    );
  });

  describe('lastTwoFailed', () => {
    function buildServiceWithRuns(runs: Partial<JobRun>[]) {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(runs),
      };
      const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      return new JobRunsService(repo as unknown as TenantRepository<JobRun>);
    }

    it('son iki kayıt da failed ise true döner', async () => {
      const service = buildServiceWithRuns([
        { status: JobRunStatus.Failed },
        { status: JobRunStatus.Failed },
      ]);

      await expect(
        service.lastTwoFailed(PROJECT_ID, QueueName.GscSync),
      ).resolves.toBe(true);
    });

    it('son iki kayıttan biri başarılıysa false döner', async () => {
      const service = buildServiceWithRuns([
        { status: JobRunStatus.Failed },
        { status: JobRunStatus.Succeeded },
      ]);

      await expect(
        service.lastTwoFailed(PROJECT_ID, QueueName.GscSync),
      ).resolves.toBe(false);
    });

    it('ikiden az kayıt varsa false döner', async () => {
      const service = buildServiceWithRuns([{ status: JobRunStatus.Failed }]);

      await expect(
        service.lastTwoFailed(PROJECT_ID, QueueName.GscSync),
      ).resolves.toBe(false);
    });
  });
});
