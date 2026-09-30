import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { addDays, todayUtc } from '../../common/dates/utc-date';
import { EnvironmentVariables } from '../../config/environment-variables';
import { NotifyJobData, QueueName } from '../../infra/queue/queues';
import { ConnectionStatus } from '../connections/entities/connection.entity';
import { ConnectionsService } from '../connections/connections.service';
import { ProjectsService } from '../clients/projects.service';
import { JobRunsService } from '../jobs/job-runs.service';
import { TrackedKeyword } from '../keywords/entities/tracked-keyword.entity';
import { TrackedKeywordsService } from '../keywords/tracked-keywords.service';
import { RankingsQueryService } from '../rankings/rankings-query.service';
import { SummaryStore } from '../summary/summary-store';
import {
  RankDropConfig,
  RankExitConfig,
  TrafficDropConfig,
} from './alert-rule-config';
import { AlertEventsStore } from './alert-events.store';
import { AlertRule, AlertRuleType } from './entities/alert-rule.entity';
import { AlertRulesService } from './alert-rules.service';

/** Kural değerlendirmesinin ürettiği, henüz dedupe/cooldown'dan geçmemiş bir aday. */
interface AlertCandidate {
  dedupeKey: string;
  severity?: string;
  payload: Record<string, unknown>;
}

const SYNC_JOB_TYPES = [QueueName.GscSync, QueueName.Ga4Sync];

/**
 * `alert-eval` job'u (ARCHITECTURE §11): projenin aktif kurallarını
 * değerlendirir, tetiklenen her olayı `AlertEventsStore` ile dedupe/cooldown
 * uygulayarak yazar ve bildirilmesi gerekenler için `notify` job'u ekler.
 * Veri özet tablolarından (`project_daily_summary`) ve `rank_daily`'den
 * türetilen `keyword_rank_latest`'ten okur; ham tabloları sorgulamaz.
 */
@Injectable()
export class AlertEvalService {
  constructor(
    private readonly alertRules: AlertRulesService,
    private readonly eventsStore: AlertEventsStore,
    private readonly trackedKeywords: TrackedKeywordsService,
    private readonly rankingsQuery: RankingsQueryService,
    private readonly summaryStore: SummaryStore,
    private readonly connectionsService: ConnectionsService,
    private readonly jobRuns: JobRunsService,
    private readonly projectsService: ProjectsService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    @InjectQueue(QueueName.Notify)
    private readonly notifyQueue: Queue<NotifyJobData>,
  ) {}

  async evaluate(
    orgId: string,
    projectId: string,
    today: string = todayUtc(),
  ): Promise<void> {
    const rules = await this.alertRules.listActive(projectId);
    if (rules.length === 0) {
      return;
    }
    const project = await this.projectsService.findOne(projectId);

    for (const rule of rules) {
      const candidates = await this.buildCandidates(
        orgId,
        projectId,
        project.name,
        rule,
        today,
      );
      for (const candidate of candidates) {
        const result = await this.eventsStore.upsertIfDue({
          orgId,
          projectId,
          ruleId: rule.id,
          dedupeKey: candidate.dedupeKey,
          payload: { ...candidate.payload, alertType: rule.type },
          severity: candidate.severity ?? 'warning',
          cooldownHours: rule.cooldownHours,
        });
        if (!result.due) {
          continue;
        }
        for (const channelId of rule.channels) {
          await this.notifyQueue.add(
            QueueName.Notify,
            { orgId, projectId, channelId, alertEventId: result.id },
            { jobId: `notify:${result.id}:${channelId}` },
          );
        }
      }
    }
  }

  private buildCandidates(
    orgId: string,
    projectId: string,
    projectName: string,
    rule: AlertRule,
    today: string,
  ): Promise<AlertCandidate[]> {
    switch (rule.type) {
      case AlertRuleType.RankDrop:
        return this.evaluateRankDrop(
          projectId,
          projectName,
          rule.config as RankDropConfig,
        );
      case AlertRuleType.RankExit:
        return this.evaluateRankExit(
          projectId,
          projectName,
          rule.config as RankExitConfig,
        );
      case AlertRuleType.TrafficDrop:
        return this.evaluateTrafficDrop(
          orgId,
          projectId,
          projectName,
          rule.config as TrafficDropConfig,
          today,
        );
      case AlertRuleType.SyncFailure:
        return this.evaluateSyncFailure(projectId, projectName);
    }
  }

  private async resolveKeywords(
    projectId: string,
    config: { groupId?: string; keywordIds?: string[] },
  ): Promise<TrackedKeyword[]> {
    const page = await this.trackedKeywords.list(projectId, {
      page: 1,
      limit: 200,
      groupId: config.groupId,
      isActive: true,
    });
    if (config.keywordIds && config.keywordIds.length > 0) {
      const ids = new Set(config.keywordIds);
      return page.items.filter((keyword) => ids.has(keyword.id));
    }
    return page.items;
  }

  private async evaluateRankDrop(
    projectId: string,
    projectName: string,
    config: RankDropConfig,
  ): Promise<AlertCandidate[]> {
    const keywords = await this.resolveKeywords(projectId, config);
    if (keywords.length === 0) return [];
    const latest = await this.rankingsQuery.latestForKeywords(
      projectId,
      keywords.map((keyword) => keyword.id),
    );
    const byId = new Map(latest.map((row) => [row.trackedKeywordId, row]));

    const candidates: AlertCandidate[] = [];
    for (const keyword of keywords) {
      const row = byId.get(keyword.id);
      if (!row || row.position === null || row.previousPosition === null) {
        continue;
      }
      const drop = row.position - row.previousPosition;
      if (drop >= config.minDrop && row.previousPosition <= config.fromTop) {
        candidates.push({
          dedupeKey: `rank_drop:${keyword.id}`,
          payload: {
            keywordId: keyword.id,
            keyword: keyword.keyword,
            projectId,
            projectName,
            previousPosition: row.previousPosition,
            position: row.position,
            drop,
            panelUrl: this.panelLink(
              `/projects/${projectId}/keywords?detail=${keyword.id}`,
            ),
          },
        });
      }
    }
    return candidates;
  }

  private async evaluateRankExit(
    projectId: string,
    projectName: string,
    config: RankExitConfig,
  ): Promise<AlertCandidate[]> {
    const keywords = await this.resolveKeywords(projectId, config);
    if (keywords.length === 0) return [];
    const latest = await this.rankingsQuery.latestForKeywords(
      projectId,
      keywords.map((keyword) => keyword.id),
    );
    const byId = new Map(latest.map((row) => [row.trackedKeywordId, row]));

    const candidates: AlertCandidate[] = [];
    for (const keyword of keywords) {
      const row = byId.get(keyword.id);
      if (!row) continue;
      const tail = row.sparkline.slice(-config.days);
      if (tail.length < config.days) continue;
      const allOutsideTop = tail.every(
        (position) => position !== null && position > config.top,
      );
      if (allOutsideTop) {
        candidates.push({
          dedupeKey: `rank_exit:${keyword.id}`,
          payload: {
            keywordId: keyword.id,
            keyword: keyword.keyword,
            projectId,
            projectName,
            position: row.position,
            top: config.top,
            days: config.days,
            panelUrl: this.panelLink(
              `/projects/${projectId}/keywords?detail=${keyword.id}`,
            ),
          },
        });
      }
    }
    return candidates;
  }

  private async evaluateTrafficDrop(
    orgId: string,
    projectId: string,
    projectName: string,
    config: TrafficDropConfig,
    today: string,
  ): Promise<AlertCandidate[]> {
    const currentTo = addDays(today, -1);
    const currentFrom = addDays(currentTo, -(config.window - 1));
    const previousTo = addDays(currentFrom, -1);
    const previousFrom = addDays(previousTo, -(config.window - 1));

    const [currentRows, previousRows] = await Promise.all([
      this.summaryStore.range(orgId, projectId, currentFrom, currentTo),
      this.summaryStore.range(orgId, projectId, previousFrom, previousTo),
    ]);

    const metricKey =
      config.metric === 'clicks' ? 'gscClicks' : 'organicSessions';
    const current = sumMetric(currentRows, metricKey);
    const previous = sumMetric(previousRows, metricKey);
    if (previous <= 0) return [];

    const pctChange = ((previous - current) / previous) * 100;
    if (pctChange < config.pct) return [];

    return [
      {
        dedupeKey: `traffic_drop:${config.metric}`,
        payload: {
          metric: config.metric,
          current,
          previous,
          pctChange,
          window: config.window,
          projectId,
          projectName,
          panelUrl: this.panelLink(`/projects/${projectId}/dashboard`),
        },
      },
    ];
  }

  private async evaluateSyncFailure(
    projectId: string,
    projectName: string,
  ): Promise<AlertCandidate[]> {
    const candidates: AlertCandidate[] = [];
    const connections = await this.connectionsService.listByProject(projectId);
    for (const connection of connections) {
      if (connection.status === ConnectionStatus.Error) {
        candidates.push({
          dedupeKey: `sync_failure:connection:${connection.id}`,
          payload: {
            connectionId: connection.id,
            connectionType: connection.type,
            reason: connection.lastError,
            projectId,
            projectName,
            panelUrl: this.panelLink(`/projects/${projectId}/connections`),
          },
        });
      }
    }
    for (const type of SYNC_JOB_TYPES) {
      if (await this.jobRuns.lastTwoFailed(projectId, type)) {
        candidates.push({
          dedupeKey: `sync_failure:jobs:${type}`,
          payload: {
            jobType: type,
            reason: 'İki ardışık senkronizasyon denemesi başarısız oldu.',
            projectId,
            projectName,
            panelUrl: this.panelLink(`/projects/${projectId}/connections`),
          },
        });
      }
    }
    return candidates;
  }

  private panelLink(path: string): string {
    const panelUrl = this.configService.get('PANEL_URL', { infer: true });
    return panelUrl ? `${panelUrl}${path}` : path;
  }
}

function sumMetric(
  rows: { gscClicks: number; organicSessions: number }[],
  key: 'gscClicks' | 'organicSessions',
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
