import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { ClientsModule } from '../clients/clients.module';
import { JobsModule } from '../jobs/jobs.module';
import { KeywordsSharedModule } from '../keywords/keywords-shared.module';
import { KeywordRankLatest } from './entities/keyword-rank-latest.entity';
import { RankDaily } from './entities/rank-daily.entity';
import { RankTask } from './entities/rank-task.entity';
import { RankDayCompletion } from './rank-day-completion';
import { RankFetchService } from './rank-fetch.service';
import { RankJobsService } from './rank-jobs.service';
import { RankPollService } from './rank-poll.service';
import { RankPostService } from './rank-post.service';
import { RankStore } from './rank-store';
import { RankSummaryStore } from './rank-summary-store';
import { RankSummaryService } from './rank-summary.service';
import { RankingsQueryService } from './rankings-query.service';

/**
 * API (anlık kontrol, rank sorguları) ve worker'ın (rank-post/poll/fetch
 * processor'ları, dispatch kaynağı) ortak kullandığı rank servisleri.
 * Keyword'lere yalnız `RankableKeywordsService` üzerinden erişilir.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RankTask, RankDaily, KeywordRankLatest]),
    QueueModule,
    ConnectorsModule,
    ClientsModule,
    JobsModule,
    KeywordsSharedModule,
  ],
  providers: [
    RankStore,
    RankDayCompletion,
    RankPostService,
    RankFetchService,
    RankPollService,
    RankJobsService,
    RankingsQueryService,
    RankSummaryStore,
    RankSummaryService,
  ],
  exports: [
    RankPostService,
    RankFetchService,
    RankPollService,
    RankJobsService,
    RankingsQueryService,
    RankSummaryService,
  ],
})
export class RankingsSharedModule {}
