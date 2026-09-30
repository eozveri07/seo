import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { RankFetchProcessor } from './rank-fetch.processor';
import { RankPollScheduler } from './rank-poll-scheduler';
import { RankPollProcessor } from './rank-poll.processor';
import { RankPostProcessor } from './rank-post.processor';
import { RankingsSharedModule } from './rankings-shared.module';

/** Worker: `rank-post` processor'ı. */
@Module({
  imports: [RankingsSharedModule, JobsModule],
  providers: [RankPostProcessor],
})
export class RankPostProcessorModule {}

/** Worker: `rank-poll` processor'ı ve 2 dakikalık Job Scheduler'ı. */
@Module({
  imports: [RankingsSharedModule],
  providers: [RankPollProcessor, RankPollScheduler],
})
export class RankPollProcessorModule {}

/** Worker: `rank-fetch` processor'ı (Standard task sonucu ve anlık kontrol). */
@Module({
  imports: [RankingsSharedModule, JobsModule],
  providers: [RankFetchProcessor],
})
export class RankFetchProcessorModule {}
