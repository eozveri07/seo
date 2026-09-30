import { JobTrigger } from './queues';

/** Bir job çalıştırması hakkındaki bilgi; `job_runs` kolonlarına karşılık gelir. */
export interface JobRunContext {
  queueName: string;
  jobId: string;
  orgId: string;
  projectId?: string;
  /** Önceden açılmış `job_runs` kaydı (manuel tetikleme ya da yeniden deneme). */
  runId?: string;
  trigger: JobTrigger;
}

export interface StartedJobRunContext extends JobRunContext {
  runId: string;
}

/**
 * `job_runs` kaydını açıp kapatan arayüz (ARCHITECTURE §5.6). `BaseProcessor`
 * her deneme için start → succeed|fail sırasıyla çağırır.
 */
export interface JobRunRecorder {
  /** Kaydı `running`'e çeker (yoksa açar) ve kaydın id'sini döner. */
  start(context: JobRunContext): Promise<string>;
  succeed(
    context: StartedJobRunContext,
    stats?: Record<string, unknown>,
  ): Promise<void>;
  /**
   * `final` false ise BullMQ job'u yeniden deneyecek: kayıt `queued`'a döner
   * ve son hata yazılır. `final` true ise kayıt `failed` olur.
   */
  fail(
    context: StartedJobRunContext,
    error: unknown,
    final: boolean,
  ): Promise<void>;
}

export const JOB_RUN_RECORDER = Symbol('JOB_RUN_RECORDER');
