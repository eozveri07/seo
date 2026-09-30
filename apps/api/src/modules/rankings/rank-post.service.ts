import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { addDays } from '../../common/dates/utc-date';
import {
  DataForSeoClient,
  SERP_TASK_POST_BATCH_SIZE,
} from '../../connectors/dataforseo/dataforseo.client';
import { DfsSerpTaskPostResult } from '../../connectors/dataforseo/dataforseo.types';
import { ConnectorAuthError } from '../../connectors/errors';
import { RankPostScope } from '../../infra/queue/queues';
import { TrackedKeywordFrequency } from '../keywords/entities/tracked-keyword.entity';
import {
  RankableKeyword,
  RankableKeywordsService,
} from '../keywords/rankable-keywords.service';
import { RankDayCompletion } from './rank-day-completion';
import { ClaimedRankTask, RankStore } from './rank-store';

/** Haftalık keyword son bu kadar günde kontrol edilmediyse günlük dispatch'e girer. */
export const WEEKLY_CHECK_WINDOW_DAYS = 7;

/** DataForSEO `task_post` başarı kodları: 20100 "Task Created.", 20000 "Ok.". */
const TASK_CREATED_CODES = new Set([20100, 20000]);

export interface RankPostStats {
  projectId: string;
  date: string;
  scope: RankPostScope;
  /** Günün kontrol edilecek keyword'leri. */
  candidates: number;
  /** Aynı gün zaten task'ı olduğu için atlananlar. */
  skipped: number;
  posted: number;
  failed: number;
}

/**
 * `rank-post` (ARCHITECTURE §9.3 adım 1). Günün keyword'leri seçilir,
 * `rank_tasks`'ta ayrılır (aynı gün task'ı olanlar atlanır), 100'lük
 * `task_post` istekleriyle gönderilir. Her task'ın `tag`'i
 * `tracked_keyword_id`'dir; dönen task id'leri tag üzerinden eşleştirilip
 * yazılır.
 */
@Injectable()
export class RankPostService {
  private readonly logger = new Logger(RankPostService.name);

  constructor(
    private readonly keywords: RankableKeywordsService,
    private readonly store: RankStore,
    private readonly dataForSeoClient: DataForSeoClient,
    private readonly dayCompletion: RankDayCompletion,
  ) {}

  async post(
    orgId: string,
    projectId: string,
    date: string,
    scope: RankPostScope,
    jobRunId?: string,
  ): Promise<RankPostStats> {
    const candidates = await this.dueKeywords(projectId, date, scope);
    const claimed = await this.store.claimTasks(
      projectId,
      date,
      candidates.map((keyword) => keyword.id),
    );
    const stats: RankPostStats = {
      projectId,
      date,
      scope,
      candidates: candidates.length,
      skipped: candidates.length - claimed.length,
      posted: 0,
      failed: 0,
    };
    if (claimed.length === 0) {
      return stats;
    }

    const keywordsById = new Map(
      candidates.map((keyword) => [keyword.id, keyword]),
    );
    for (
      let offset = 0;
      offset < claimed.length;
      offset += SERP_TASK_POST_BATCH_SIZE
    ) {
      const batch = claimed.slice(offset, offset + SERP_TASK_POST_BATCH_SIZE);
      let results: DfsSerpTaskPostResult[];
      try {
        results = await this.dataForSeoClient.serpTaskPost(
          batch.map((task) => toTaskPostItem(keywordsById, task)),
          { orgId, projectId, jobRunId },
        );
      } catch (error) {
        // Gönderilemeyen (bu ve sonraki batch'ler) task'lar `failed` olur;
        // BullMQ yeniden denediğinde `claimTasks` onları tekrar ayırır.
        const unsent = claimed.slice(offset).map((task) => task.id);
        await this.store.markFailed(unsent, `task_post: ${messageOf(error)}`);
        stats.failed += unsent.length;
        this.logger.error(
          `rank-post başarısız: orgId=${orgId} projectId=${projectId} date=${date} unsent=${unsent.length}`,
          error instanceof Error ? error.stack : String(error),
        );
        if (error instanceof ConnectorAuthError) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
      const outcome = await this.recordResults(batch, results);
      stats.posted += outcome.posted;
      stats.failed += outcome.failed;
    }

    if (stats.posted === 0) {
      await this.dayCompletion.checkCompleted(orgId, projectId, date);
    }
    this.logger.log(
      `rank-post: orgId=${orgId} projectId=${projectId} date=${date} scope=${scope} ` +
        `candidates=${stats.candidates} skipped=${stats.skipped} posted=${stats.posted} failed=${stats.failed}`,
    );
    return stats;
  }

  /**
   * `daily`: günlük keyword'ler + son 7 günde (bugün dahil) başarısız olmayan
   * task'ı olmayan haftalık keyword'ler (yeni eklenen ya da takılıp `failed`
   * olan haftalıklar ilk günlük dispatch'te gönderilir). `weekly`: tüm
   * haftalık keyword'ler.
   */
  private async dueKeywords(
    projectId: string,
    date: string,
    scope: RankPostScope,
  ): Promise<RankableKeyword[]> {
    if (scope === 'weekly') {
      return this.keywords.listActive(projectId, [
        TrackedKeywordFrequency.Weekly,
      ]);
    }
    const active = await this.keywords.listActive(projectId, [
      TrackedKeywordFrequency.Daily,
      TrackedKeywordFrequency.Weekly,
    ]);
    const weeklyIds = active
      .filter((keyword) => keyword.frequency === TrackedKeywordFrequency.Weekly)
      .map((keyword) => keyword.id);
    const checkedThisWeek = await this.store.keywordsWithTaskBetween(
      projectId,
      weeklyIds,
      addDays(date, -(WEEKLY_CHECK_WINDOW_DAYS - 1)),
      date,
    );
    return active.filter(
      (keyword) =>
        keyword.frequency === TrackedKeywordFrequency.Daily ||
        !checkedThisWeek.has(keyword.id),
    );
  }

  /** Dönen task'ları `tag` (= `tracked_keyword_id`) ile ayrılan satırlara eşler. */
  private async recordResults(
    batch: ClaimedRankTask[],
    results: DfsSerpTaskPostResult[],
  ): Promise<{ posted: number; failed: number }> {
    const byTag = new Map(
      results
        .filter((result) => result.tag !== null)
        .map((result) => [result.tag as string, result]),
    );
    const assignments: { id: string; providerTaskId: string }[] = [];
    const failures = new Map<string, string[]>();
    for (const task of batch) {
      const result = byTag.get(task.trackedKeywordId);
      if (result && TASK_CREATED_CODES.has(result.statusCode) && result.id) {
        assignments.push({ id: task.id, providerTaskId: result.id });
        continue;
      }
      const reason = result
        ? `task_post ${result.statusCode}: ${result.statusMessage}`
        : 'task_post yanıtında bu keyword yok';
      failures.set(reason, [...(failures.get(reason) ?? []), task.id]);
    }
    await this.store.setProviderTaskIds(assignments);
    let failed = 0;
    for (const [reason, ids] of failures) {
      await this.store.markFailed(ids, reason);
      failed += ids.length;
    }
    return { posted: assignments.length, failed };
  }
}

function toTaskPostItem(
  keywordsById: Map<string, RankableKeyword>,
  task: ClaimedRankTask,
) {
  const keyword = keywordsById.get(task.trackedKeywordId);
  if (!keyword) {
    // claimTasks yalnız verilen id'leri döner; buraya düşmek bir hatadır.
    throw new Error(`Ayrılan task'ın keyword'ü yok: ${task.trackedKeywordId}`);
  }
  return {
    keyword: keyword.keyword,
    locationCode: keyword.locationCode,
    languageCode: keyword.languageCode,
    device: keyword.device,
    depth: keyword.depth,
    tag: keyword.id,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
