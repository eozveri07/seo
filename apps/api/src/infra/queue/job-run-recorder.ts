/** Bir job çalıştırması hakkındaki bilgi; `job_runs` tablosunun kolonlarına karşılık gelir (T1.5). */
export interface JobRunContext {
  queueName: string;
  jobId: string;
  orgId: string;
  projectId?: string;
}

/**
 * `job_runs` tablosu T1.5'te gelene kadar kaydı açıp kapatan arayüz.
 * `BaseProcessor` her job için start → succeed|fail sırasıyla çağırır.
 */
export interface JobRunRecorder {
  start(context: JobRunContext): Promise<void>;
  succeed(context: JobRunContext): Promise<void>;
  fail(context: JobRunContext, error: unknown): Promise<void>;
}

export const JOB_RUN_RECORDER = Symbol('JOB_RUN_RECORDER');
