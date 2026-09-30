import { Injectable, Logger } from '@nestjs/common';
import { calculateRankLatest } from './rank-summary-calc';
import {
  RankPositionDistribution,
  RankSummaryStore,
} from './rank-summary-store';

export interface RankSummaryResult extends RankPositionDistribution {
  /** `keyword_rank_latest`'i güncellenen keyword sayısı. */
  refreshedKeywordCount: number;
}

/**
 * `summary` job'unun (T1.10) rank tarafı: o günün pozisyon dağılımını
 * döner ve o gün rank verisi değişen keyword'lerin `keyword_rank_latest`
 * satırını günceller (ARCHITECTURE §10 adım 2). Hesap
 * `rank-summary-calc`'te saf fonksiyon, burada yalnız veri toplama ve
 * yazma.
 */
@Injectable()
export class RankSummaryService {
  private readonly logger = new Logger(RankSummaryService.name);

  constructor(private readonly store: RankSummaryStore) {}

  async summarize(
    orgId: string,
    projectId: string,
    date: string,
  ): Promise<RankSummaryResult> {
    const distribution = await this.store.distribution(orgId, projectId, date);
    if (distribution.trackedKeywordIds.length === 0) {
      return { ...distribution, refreshedKeywordCount: 0 };
    }

    const { history, urls, existingBest } = await this.store.historyAndBest(
      orgId,
      projectId,
      date,
      distribution.trackedKeywordIds,
    );

    for (const trackedKeywordId of distribution.trackedKeywordIds) {
      const calc = calculateRankLatest({
        date,
        history: history.get(trackedKeywordId) ?? [],
        existingBestPosition: existingBest.get(trackedKeywordId) ?? null,
      });
      await this.store.upsertLatest(orgId, projectId, {
        trackedKeywordId,
        position: calc.position,
        url: urls.get(trackedKeywordId) ?? null,
        previousPosition: calc.previousPosition,
        change1d: calc.change1d,
        change7d: calc.change7d,
        change30d: calc.change30d,
        bestPosition: calc.bestPosition,
        sparkline: calc.sparkline,
      });
    }

    this.logger.log(
      `keyword_rank_latest güncellendi: orgId=${orgId} projectId=${projectId} date=${date} count=${distribution.trackedKeywordIds.length}`,
    );
    return {
      ...distribution,
      refreshedKeywordCount: distribution.trackedKeywordIds.length,
    };
  }
}
