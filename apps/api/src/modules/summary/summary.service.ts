import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GscQueryService } from '../gsc/gsc-query.service';
import { Ga4QueryService } from '../ga4/ga4-query.service';
import {
  AlertEvalJobData,
  JobTrigger,
  QueueName,
} from '../../infra/queue/queues';
import { RankSummaryService } from '../rankings/rank-summary.service';
import { SummaryStore } from './summary-store';
import { computeVisibilityScore } from './visibility.constants';

export interface SummaryComputeResult {
  gscClicks: number;
  organicSessions: number;
  kwTracked: number;
  visibilityScore: number;
  refreshedKeywordCount: number;
}

/**
 * `summary` job'u (ARCHITECTURE §10): proje ve tarih bazında
 * `project_daily_summary`'yi GSC/GA4/rank verisinden hesaplayıp upsert
 * eder, rank verisi değişen keyword'lerin `keyword_rank_latest`'ini
 * günceller ve bitince `alert-eval`'i kuyruğa ekler. Idempotent: aynı
 * `(projectId, date)` için tekrar çalışmak son hali yazar.
 */
@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly store: SummaryStore,
    private readonly gscQuery: GscQueryService,
    private readonly ga4Query: Ga4QueryService,
    private readonly rankSummary: RankSummaryService,
    @InjectQueue(QueueName.AlertEval)
    private readonly alertEvalQueue: Queue<AlertEvalJobData>,
  ) {}

  async compute(
    orgId: string,
    projectId: string,
    date: string,
  ): Promise<SummaryComputeResult> {
    const [gsc, ga4, rank] = await Promise.all([
      this.gscQuery.dayTotals(projectId, date),
      this.ga4Query.organicDayTotals(projectId, date),
      this.rankSummary.summarize(orgId, projectId, date),
    ]);

    const visibilityScore = computeVisibilityScore(rank.positions);

    await this.store.upsert({
      orgId,
      projectId,
      date,
      gscClicks: gsc.clicks,
      gscImpressions: gsc.impressions,
      gscCtr: gsc.ctr,
      gscPosition: gsc.position,
      organicSessions: ga4.sessions,
      organicKeyEvents: ga4.keyEvents,
      kwTracked: rank.tracked,
      kwTop3: rank.top3,
      kwTop10: rank.top10,
      kwTop20: rank.top20,
      kwTop100: rank.top100,
      kwAvgPosition: rank.avgPosition,
      visibilityScore,
    });

    await this.alertEvalQueue.add(
      QueueName.AlertEval,
      { orgId, projectId, trigger: JobTrigger.System },
      { jobId: `alert-eval:${projectId}:${date}` },
    );

    this.logger.log(
      `project_daily_summary güncellendi: orgId=${orgId} projectId=${projectId} date=${date} kwTracked=${rank.tracked}`,
    );
    return {
      gscClicks: gsc.clicks,
      organicSessions: ga4.sessions,
      kwTracked: rank.tracked,
      visibilityScore,
      refreshedKeywordCount: rank.refreshedKeywordCount,
    };
  }
}
