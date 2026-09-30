import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import { JobRun } from './entities/job-run.entity';
import { JobRunsService } from './job-runs.service';

/**
 * ARCHITECTURE §5.6 `job_runs`. Processor modülleri `JOB_RUN_RECORDER`'ı,
 * manuel tetikleme yapan API modülleri `JobRunsService`'i buradan alır.
 */
@Module({
  imports: [TypeOrmModule.forFeature([JobRun])],
  providers: [
    provideTenantRepository(JobRun),
    JobRunsService,
    { provide: JOB_RUN_RECORDER, useExisting: JobRunsService },
  ],
  exports: [JobRunsService, JOB_RUN_RECORDER],
})
export class JobsModule {}
