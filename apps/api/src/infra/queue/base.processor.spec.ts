import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor, MissingOrgIdError } from './base.processor';
import { JobRunContext, JobRunRecorder } from './job-run-recorder';
import { PingJobData, QueueName } from './queues';

class TestProcessor extends BaseProcessor<QueueName.Ping> {
  protected readonly queueName = QueueName.Ping;
  protected readonly logger = new Logger('TestProcessor');
  handleCalls: Job<PingJobData>[] = [];
  orgIdSeenDuringHandle: string | undefined;

  constructor(cls: ClsService<AppClsStore>, jobRunRecorder: JobRunRecorder) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<PingJobData>): Promise<unknown> {
    this.handleCalls.push(job);
    this.orgIdSeenDuringHandle = this.cls.get('orgId');
    return Promise.resolve({ ok: true });
  }
}

function buildJob(data: Partial<PingJobData>, id = 'job-1'): Job<PingJobData> {
  return { id, data } as unknown as Job<PingJobData>;
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

function buildJobRunRecorder(): JobRunRecorder & {
  calls: { method: string; context: JobRunContext }[];
} {
  const calls: { method: string; context: JobRunContext }[] = [];
  return {
    calls,
    start: (context) => {
      calls.push({ method: 'start', context });
      return Promise.resolve();
    },
    succeed: (context) => {
      calls.push({ method: 'succeed', context });
      return Promise.resolve();
    },
    fail: (context) => {
      calls.push({ method: 'fail', context });
      return Promise.resolve();
    },
  };
}

describe('BaseProcessor', () => {
  it('orgId olmadan MissingOrgIdError fırlatır ve handle çağrılmaz', async () => {
    const processor = new TestProcessor(
      buildClsService(),
      buildJobRunRecorder(),
    );
    const job = buildJob({ projectId: 'p-1' });

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      MissingOrgIdError,
    );
    expect(processor.handleCalls).toHaveLength(0);
  });

  it("orgId'yi CLS'e set eder ve handle'ı çağırır", async () => {
    const recorder = buildJobRunRecorder();
    const processor = new TestProcessor(buildClsService(), recorder);
    const job = buildJob({ orgId: 'org-1', projectId: 'proj-1' });

    const result = await processor.process(job);

    expect(result).toEqual({ ok: true });
    expect(processor.orgIdSeenDuringHandle).toBe('org-1');
    expect(processor.handleCalls).toEqual([job]);
  });

  it('başarılı job için start ve succeed kaydı açar', async () => {
    const recorder = buildJobRunRecorder();
    const processor = new TestProcessor(buildClsService(), recorder);
    const job = buildJob({ orgId: 'org-1' });

    await processor.process(job);

    expect(recorder.calls.map((c) => c.method)).toEqual(['start', 'succeed']);
    expect(recorder.calls[0].context).toEqual({
      queueName: QueueName.Ping,
      jobId: 'job-1',
      orgId: 'org-1',
      projectId: undefined,
    });
  });

  it('handle hata fırlatırsa fail kaydı açar ve hatayı yeniden fırlatır', async () => {
    const recorder = buildJobRunRecorder();
    class FailingProcessor extends TestProcessor {
      protected handle(): Promise<unknown> {
        return Promise.reject(new Error('boom'));
      }
    }
    const processor = new FailingProcessor(buildClsService(), recorder);
    const job = buildJob({ orgId: 'org-1' });

    await expect(processor.process(job)).rejects.toThrow('boom');
    expect(recorder.calls.map((c) => c.method)).toEqual(['start', 'fail']);
  });
});
