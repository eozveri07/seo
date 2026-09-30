import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor, MissingOrgIdError } from './base.processor';
import {
  JobRunContext,
  JobRunRecorder,
  StartedJobRunContext,
} from './job-run-recorder';
import { GscSyncJobData, JobTrigger, QueueName } from './queues';

class TestProcessor extends BaseProcessor<QueueName.GscSync> {
  protected readonly queueName = QueueName.GscSync;
  protected readonly logger = new Logger('TestProcessor');
  handleCalls: Job<GscSyncJobData>[] = [];
  orgIdSeenDuringHandle: string | undefined;
  result: unknown = { ok: true };

  constructor(cls: ClsService<AppClsStore>, jobRunRecorder: JobRunRecorder) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<GscSyncJobData>): Promise<unknown> {
    this.handleCalls.push(job);
    this.orgIdSeenDuringHandle = this.cls.get('orgId');
    return Promise.resolve(this.result);
  }
}

interface FakeJob extends Job<GscSyncJobData> {
  updateData: jest.Mock;
}

function buildJob(
  data: Partial<GscSyncJobData>,
  overrides: { attemptsMade?: number; attempts?: number } = {},
): FakeJob {
  const job = {
    id: 'job-1',
    data,
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 5 },
    updateData: jest.fn((next: GscSyncJobData) => {
      job.data = next;
      return Promise.resolve();
    }),
  };
  return job as unknown as FakeJob;
}

function buildClsService(): ClsService<AppClsStore> {
  const store = new Map<string, unknown>();
  return {
    run: <T>(callback: () => T): T => callback(),
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
    get: (key: string) => store.get(key),
    isActive: () => true,
  } as unknown as ClsService<AppClsStore>;
}

type RecorderCall =
  | { method: 'start'; context: JobRunContext }
  | {
      method: 'succeed';
      context: StartedJobRunContext;
      stats?: Record<string, unknown>;
    }
  | { method: 'fail'; context: StartedJobRunContext; final: boolean };

function buildJobRunRecorder(runId = 'run-1'): JobRunRecorder & {
  calls: RecorderCall[];
} {
  const calls: RecorderCall[] = [];
  return {
    calls,
    start: (context) => {
      calls.push({ method: 'start', context });
      return Promise.resolve(context.runId ?? runId);
    },
    succeed: (context, stats) => {
      calls.push({ method: 'succeed', context, stats });
      return Promise.resolve();
    },
    fail: (context, _error, final) => {
      calls.push({ method: 'fail', context, final });
      return Promise.resolve();
    },
  };
}

describe('BaseProcessor', () => {
  it('orgId olmadan MissingOrgIdError fırlatır ve handle çağrılmaz', async () => {
    const recorder = buildJobRunRecorder();
    const processor = new TestProcessor(buildClsService(), recorder);
    const job = buildJob({ projectId: 'p-1' });

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      MissingOrgIdError,
    );
    expect(processor.handleCalls).toHaveLength(0);
    expect(recorder.calls).toHaveLength(0);
  });

  it("orgId'yi CLS'e set eder ve handle'ı çağırır", async () => {
    const processor = new TestProcessor(
      buildClsService(),
      buildJobRunRecorder(),
    );
    const job = buildJob({ orgId: 'org-1', projectId: 'proj-1' });

    const result = await processor.process(job);

    expect(result).toEqual({ ok: true });
    expect(processor.orgIdSeenDuringHandle).toBe('org-1');
    expect(processor.handleCalls).toEqual([job]);
  });

  it("başarılı job'da kaydı açar, runId'yi job data'ya yazar ve sonucu stats olarak kapatır", async () => {
    const recorder = buildJobRunRecorder('run-new');
    const processor = new TestProcessor(buildClsService(), recorder);
    processor.result = { days: 5, rows: 42 };
    const job = buildJob({ orgId: 'org-1', projectId: 'proj-1' });

    await processor.process(job);

    expect(recorder.calls.map((c) => c.method)).toEqual(['start', 'succeed']);
    expect(recorder.calls[0].context).toEqual({
      queueName: QueueName.GscSync,
      jobId: 'job-1',
      orgId: 'org-1',
      projectId: 'proj-1',
      runId: undefined,
      trigger: JobTrigger.Schedule,
    });
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-new' }),
    );
    expect(recorder.calls[1]).toMatchObject({
      context: { runId: 'run-new' },
      stats: { days: 5, rows: 42 },
    });
  });

  it('job data runId taşıyorsa aynı kaydı kullanır ve data güncellenmez', async () => {
    const recorder = buildJobRunRecorder();
    const processor = new TestProcessor(buildClsService(), recorder);
    const job = buildJob({
      orgId: 'org-1',
      runId: 'run-manual',
      trigger: JobTrigger.Manual,
    });

    await processor.process(job);

    expect(recorder.calls[0].context).toMatchObject({
      runId: 'run-manual',
      trigger: JobTrigger.Manual,
    });
    expect(job.updateData).not.toHaveBeenCalled();
  });

  class FailingProcessor extends TestProcessor {
    error: Error = new Error('boom');
    protected handle(): Promise<unknown> {
      return Promise.reject(this.error);
    }
  }

  it('deneme hakkı kaldıysa fail(final=false) çağırır ve hatayı yeniden fırlatır', async () => {
    const recorder = buildJobRunRecorder();
    const processor = new FailingProcessor(buildClsService(), recorder);
    const job = buildJob({ orgId: 'org-1' }, { attemptsMade: 1, attempts: 5 });

    await expect(processor.process(job)).rejects.toThrow('boom');
    expect(recorder.calls.map((c) => c.method)).toEqual(['start', 'fail']);
    expect(recorder.calls[1]).toMatchObject({ final: false });
  });

  it('son denemede ya da UnrecoverableError ile fail(final=true) çağırır', async () => {
    const lastAttempt = buildJobRunRecorder();
    const processor = new FailingProcessor(buildClsService(), lastAttempt);
    await expect(
      processor.process(
        buildJob({ orgId: 'org-1' }, { attemptsMade: 4, attempts: 5 }),
      ),
    ).rejects.toThrow('boom');
    expect(lastAttempt.calls[1]).toMatchObject({ final: true });

    const unrecoverable = buildJobRunRecorder();
    const processor2 = new FailingProcessor(buildClsService(), unrecoverable);
    processor2.error = new UnrecoverableError('yetki yok');
    await expect(
      processor2.process(buildJob({ orgId: 'org-1' })),
    ).rejects.toThrow('yetki yok');
    expect(unrecoverable.calls[1]).toMatchObject({ final: true });
  });
});
