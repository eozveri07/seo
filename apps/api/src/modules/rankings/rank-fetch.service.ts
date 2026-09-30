import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
} from '../../connectors/errors';
import { ProjectsService } from '../clients/projects.service';
import { RankableKeywordsService } from '../keywords/rankable-keywords.service';
import { RankSource } from './entities/rank-daily.entity';
import { RankTaskStatus } from './entities/rank-task.entity';
import { RankDayCompletion } from './rank-day-completion';
import { RankStore } from './rank-store';
import { parseSerp } from './serp-parse';

/** DataForSEO task-level başarı kodu. */
const TASK_OK = 20000;
/** Task henüz sonuçlanmadı ("Task Handed.", "Task In Queue."): sonra yeniden denenir. */
const TASK_PENDING_CODES = new Set([40601, 40602]);

export interface RankFetchStats {
  rankTaskId: string;
  outcome: 'fetched' | 'failed' | 'skipped';
  date?: string;
  trackedKeywordId?: string;
  position?: number | null;
  dayCompleted?: boolean;
}

export interface RankLiveStats {
  trackedKeywordId: string;
  date: string;
  position: number | null;
  rankAbsolute: number | null;
}

/** Task sonuçlanmadı; BullMQ backoff'la yeniden dener. */
export class RankTaskNotReadyError extends Error {
  constructor(providerTaskId: string, statusCode: number) {
    super(
      `DataForSEO task henüz hazır değil: ${providerTaskId} (${statusCode})`,
    );
    this.name = 'RankTaskNotReadyError';
  }
}

/**
 * `rank-fetch` (ARCHITECTURE §9.3 adım 3) ve anlık kontrol. SERP sonucu
 * `parseSerp` ile proje domain'ine göre çözülür, `rank_daily`'ye upsert
 * edilir. Standard task'ta task `fetched` olur ve projenin günü bittiyse
 * `rank.day_completed` yayılır.
 */
@Injectable()
export class RankFetchService {
  private readonly logger = new Logger(RankFetchService.name);

  constructor(
    private readonly store: RankStore,
    private readonly dataForSeoClient: DataForSeoClient,
    private readonly projectsService: ProjectsService,
    private readonly keywords: RankableKeywordsService,
    private readonly dayCompletion: RankDayCompletion,
  ) {}

  async fetchTask(
    orgId: string,
    projectId: string,
    rankTaskId: string,
    jobRunId?: string,
  ): Promise<RankFetchStats> {
    const task = await this.store.findTask(rankTaskId);
    if (
      !task ||
      task.projectId !== projectId ||
      !task.providerTaskId ||
      (task.status !== RankTaskStatus.Posted &&
        task.status !== RankTaskStatus.Ready)
    ) {
      // Silinmiş, zaten çekilmiş ya da takılıp `failed` olmuş task.
      return { rankTaskId, outcome: 'skipped' };
    }

    const project = await this.projectsService.findOne(projectId);
    const result = await this.withConnectorErrors(rankTaskId, () =>
      this.dataForSeoClient.serpTaskGetAdvanced(task.providerTaskId as string, {
        orgId,
        projectId,
        jobRunId,
      }),
    );
    if (result !== 'failed' && result !== null) {
      if (TASK_PENDING_CODES.has(result.statusCode)) {
        throw new RankTaskNotReadyError(task.providerTaskId, result.statusCode);
      }
    }
    if (
      result === 'failed' ||
      result === null ||
      result.statusCode !== TASK_OK
    ) {
      if (result !== 'failed') {
        await this.store.markFailed(
          [rankTaskId],
          result
            ? `task_get ${result.statusCode}: ${result.statusMessage}`
            : 'task_get yanıtı boş',
        );
      }
      const dayCompleted = await this.dayCompletion.checkCompleted(
        orgId,
        projectId,
        task.checkDate,
      );
      return {
        rankTaskId,
        outcome: 'failed',
        date: task.checkDate,
        dayCompleted,
      };
    }

    const parsed = parseSerp(result, project.domain);
    await this.store.upsertRankDaily({
      date: task.checkDate,
      projectId,
      trackedKeywordId: task.trackedKeywordId,
      ...parsed,
      checkedAt: new Date(),
      source: RankSource.DfsStandard,
    });
    await this.store.markFetched(rankTaskId);
    const dayCompleted = await this.dayCompletion.checkCompleted(
      orgId,
      projectId,
      task.checkDate,
    );
    return {
      rankTaskId,
      outcome: 'fetched',
      date: task.checkDate,
      trackedKeywordId: task.trackedKeywordId,
      position: parsed.position,
      dayCompleted,
    };
  }

  /**
   * Anlık kontrol (`check-now`): `live/advanced`, sonuç `source = dfs_live`
   * ile o günün satırına yazılır. Ücretli olduğu için yeniden denenmez
   * (geçici ağ hataları client içinde denenir).
   */
  async checkLive(
    orgId: string,
    projectId: string,
    trackedKeywordId: string,
    date: string,
    jobRunId?: string,
  ): Promise<RankLiveStats> {
    const keyword = await this.keywords.findOne(projectId, trackedKeywordId);
    const project = await this.projectsService.findOne(projectId);
    let result;
    try {
      result = await this.dataForSeoClient.serpLiveAdvanced(
        {
          keyword: keyword.keyword,
          locationCode: keyword.locationCode,
          languageCode: keyword.languageCode,
          device: keyword.device,
          depth: keyword.depth,
          tag: keyword.id,
        },
        { orgId, projectId, jobRunId },
      );
    } catch (error) {
      throw new UnrecoverableError(messageOf(error));
    }
    if (!result || result.statusCode !== TASK_OK) {
      throw new UnrecoverableError(
        result
          ? `live/advanced ${result.statusCode}: ${result.statusMessage}`
          : 'live/advanced yanıtı boş',
      );
    }

    const parsed = parseSerp(result, project.domain);
    await this.store.upsertRankDaily({
      date,
      projectId,
      trackedKeywordId,
      ...parsed,
      checkedAt: new Date(),
      source: RankSource.DfsLive,
    });
    this.logger.log(
      `rank check-now: orgId=${orgId} projectId=${projectId} keywordId=${trackedKeywordId} position=${parsed.position ?? 'yok'}`,
    );
    return {
      trackedKeywordId,
      date,
      position: parsed.position,
      rankAbsolute: parsed.rankAbsolute,
    };
  }

  /**
   * Kalıcı hatada task `failed` yapılır ve `'failed'` döner (yeniden
   * denemek sonucu değiştirmez); auth hatası job'u yeniden denemesiz
   * düşürür; geçici hatalar BullMQ'ya bırakılır.
   */
  private async withConnectorErrors<T>(
    rankTaskId: string,
    fn: () => Promise<T>,
  ): Promise<T | 'failed'> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ConnectorPermanentError) {
        await this.store.markFailed([rankTaskId], `task_get: ${error.message}`);
        return 'failed';
      }
      if (error instanceof ConnectorAuthError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
