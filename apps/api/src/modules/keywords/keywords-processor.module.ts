import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { KeywordVolumeProcessor } from './keyword-volume.processor';
import { KeywordsSharedModule } from './keywords-shared.module';

/** Worker: `keyword-volume` processor'ı. */
@Module({
  imports: [KeywordsSharedModule, JobsModule],
  providers: [KeywordVolumeProcessor],
})
export class KeywordVolumeProcessorModule {}
