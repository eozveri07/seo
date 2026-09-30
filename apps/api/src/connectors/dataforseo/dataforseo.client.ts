import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { ApiUsageProvider } from '../../modules/usage/entities/api-usage.entity';
import { UsageService } from '../../modules/usage/usage.service';
import {
  ConnectorAuthError,
  ConnectorError,
  ConnectorTransientError,
} from '../errors';
import {
  classifyDataForSeoApiStatus,
  classifyDataForSeoHttpStatus,
} from './dataforseo.errors';
import {
  DataForSeoEnvelope,
  DataForSeoTask,
  DfsKeywordVolumeResult,
  DfsLanguage,
  DfsLocation,
  DfsSerpAdvancedResult,
  DfsSerpLiveTask,
  DfsSerpOrganicItem,
  DfsSerpTaskPostItem,
  DfsSerpTaskPostResult,
  DfsTaskReadyItem,
  DfsUsageContext,
} from './dataforseo.types';

const BASE_URL = 'https://api.dataforseo.com';
/** İstek başı en fazla 100 task (ARCHITECTURE §9.3/PLAN T1.7). */
export const SERP_TASK_POST_BATCH_SIZE = 100;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAYS_MS = [200, 500];

export interface DataForSeoClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
  retryDelaysMs?: number[];
}

/**
 * ARCHITECTURE §9.3: DataForSEO SERP/keyword client'ı. Basic auth, top-level
 * ve task-level `status_code` kontrolü, geçici hatalarda (429/5xx/ağ) yeniden
 * deneme. Ücretli çağrılarda `UsageService.record` çağrılır (CLAUDE.md kural
 * 5: iş mantığı içermez, sadece maliyet kaydı bir yan etkidir).
 */
@Injectable()
export class DataForSeoClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly retryDelaysMs: number[];

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly usageService: UsageService,
    options: DataForSeoClientOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn =
      options.sleepFn ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  /** `serp/google/organic/task_post`: istek başı en fazla 100 task. */
  async serpTaskPost(
    tasks: DfsSerpTaskPostItem[],
    context: DfsUsageContext = {},
  ): Promise<DfsSerpTaskPostResult[]> {
    const results: DfsSerpTaskPostResult[] = [];
    for (const batch of chunk(tasks, SERP_TASK_POST_BATCH_SIZE)) {
      const envelope = await this.requestWithRetry<Record<string, unknown>>(
        '/v3/serp/google/organic/task_post',
        { method: 'POST', body: batch.map(toTaskPostBody) },
      );
      const dfsTasks = envelope.tasks ?? [];
      await this.recordUsage(
        'serp/google/organic/task_post',
        batch.length,
        sumTaskCosts(dfsTasks, envelope.cost),
        context,
      );
      results.push(...dfsTasks.map(toTaskPostResult));
    }
    return results;
  }

  /** `serp/google/organic/tasks_ready`: hazır task id'lerini döner. */
  async serpTasksReady(
    context: DfsUsageContext = {},
  ): Promise<DfsTaskReadyItem[]> {
    const envelope = await this.requestWithRetry<{
      id: string;
      se: string;
      se_type: string;
      date: string;
      tag: string | null;
    }>('/v3/serp/google/organic/tasks_ready', { method: 'GET' });
    const dfsTasks = envelope.tasks ?? [];
    await this.recordUsage(
      'serp/google/organic/tasks_ready',
      dfsTasks.length,
      sumTaskCosts(dfsTasks, envelope.cost),
      context,
    );
    return dfsTasks
      .flatMap((task) => task.result ?? [])
      .map((item) => ({
        id: item.id,
        se: item.se,
        seType: item.se_type,
        date: item.date,
        tag: item.tag ?? null,
      }));
  }

  /** `serp/google/organic/task_get/advanced/{id}`: sonuçlanmış task'ın SERP sonucu. */
  async serpTaskGetAdvanced(
    id: string,
    context: DfsUsageContext = {},
  ): Promise<DfsSerpAdvancedResult | null> {
    const envelope = await this.requestWithRetry<RawSerpResult>(
      `/v3/serp/google/organic/task_get/advanced/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    const dfsTasks = envelope.tasks ?? [];
    await this.recordUsage(
      'serp/google/organic/task_get/advanced',
      1,
      sumTaskCosts(dfsTasks, envelope.cost),
      context,
    );
    const task = dfsTasks[0];
    return task ? toAdvancedResult(task) : null;
  }

  /** `serp/google/organic/live/advanced`: anlık kontrol (`source = dfs_live`). */
  async serpLiveAdvanced(
    task: DfsSerpLiveTask,
    context: DfsUsageContext = {},
  ): Promise<DfsSerpAdvancedResult | null> {
    const envelope = await this.requestWithRetry<RawSerpResult>(
      '/v3/serp/google/organic/live/advanced',
      { method: 'POST', body: [toTaskPostBody(task)] },
    );
    const dfsTasks = envelope.tasks ?? [];
    await this.recordUsage(
      'serp/google/organic/live/advanced',
      1,
      sumTaskCosts(dfsTasks, envelope.cost),
      context,
    );
    const result = dfsTasks[0];
    return result ? toAdvancedResult(result) : null;
  }

  /** `serp/google/locations`: referans veri, ücretsiz. */
  async locations(): Promise<DfsLocation[]> {
    const envelope = await this.requestWithRetry<RawLocation>(
      '/v3/serp/google/locations',
      { method: 'GET' },
    );
    return (envelope.tasks ?? [])
      .flatMap((task) => task.result ?? [])
      .map((item) => ({
        locationCode: item.location_code,
        locationName: item.location_name,
        countryIsoCode: item.country_iso_code ?? null,
      }));
  }

  /** `serp/google/languages`: referans veri, ücretsiz. */
  async languages(): Promise<DfsLanguage[]> {
    const envelope = await this.requestWithRetry<RawLanguage>(
      '/v3/serp/google/languages',
      { method: 'GET' },
    );
    return (envelope.tasks ?? [])
      .flatMap((task) => task.result ?? [])
      .map((item) => ({
        languageCode: item.language_code,
        languageName: item.language_name,
      }));
  }

  /** `keywords_data/google_ads/search_volume/live`: keyword başına hacim ve CPC. */
  async keywordSearchVolume(
    keywords: string[],
    locationCode: number,
    languageCode: string,
    context: DfsUsageContext = {},
  ): Promise<DfsKeywordVolumeResult[]> {
    const envelope = await this.requestWithRetry<RawKeywordVolume>(
      '/v3/keywords_data/google_ads/search_volume/live',
      {
        method: 'POST',
        body: [
          {
            keywords,
            location_code: locationCode,
            language_code: languageCode,
          },
        ],
      },
    );
    const dfsTasks = envelope.tasks ?? [];
    await this.recordUsage(
      'keywords_data/google_ads/search_volume/live',
      keywords.length,
      sumTaskCosts(dfsTasks, envelope.cost),
      context,
    );
    return dfsTasks
      .flatMap((task) => task.result ?? [])
      .map((item) => ({
        keyword: item.keyword,
        searchVolume: item.search_volume ?? null,
        cpc: item.cpc ?? null,
      }));
  }

  private async recordUsage(
    endpoint: string,
    units: number,
    cost: number,
    context: DfsUsageContext,
  ): Promise<void> {
    await this.usageService.record({
      provider: ApiUsageProvider.DataForSeo,
      endpoint,
      units,
      cost,
      orgId: context.orgId,
      projectId: context.projectId,
      jobRunId: context.jobRunId,
    });
  }

  private async requestWithRetry<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<DataForSeoEnvelope<T>> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.performRequest<T>(path, init);
      } catch (error) {
        const connectorError = toConnectorError(error);
        const retryable =
          connectorError.kind === 'transient' ||
          connectorError.kind === 'quota';
        if (!retryable || attempt >= this.maxRetries) {
          throw connectorError;
        }
        await this.sleepFn(
          this.retryDelaysMs[attempt] ?? this.retryDelaysMs.at(-1) ?? 0,
        );
        attempt += 1;
      }
    }
  }

  private async performRequest<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<DataForSeoEnvelope<T>> {
    const login = this.configService.get('DFS_LOGIN', { infer: true });
    const password = this.configService.get('DFS_PASSWORD', { infer: true });
    if (!login || !password) {
      throw new ConnectorAuthError(
        'DFS_LOGIN/DFS_PASSWORD tanımlı değil; DataForSEO çağrısı yapılamaz.',
      );
    }
    const auth = Buffer.from(`${login}:${password}`).toString('base64');

    const response = await this.fetchFn(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      throw classifyDataForSeoHttpStatus(
        response.status,
        await safeText(response),
      );
    }

    const envelope = (await response.json()) as DataForSeoEnvelope<T>;
    if (envelope.status_code !== 20000) {
      throw classifyDataForSeoApiStatus(
        envelope.status_code,
        envelope.status_message,
      );
    }
    return envelope;
  }
}

interface RawOrganicItem {
  type: string;
  rank_group: number | null;
  rank_absolute: number | null;
  domain: string | null;
  url: string | null;
  title: string | null;
}

/** `task_get/advanced` ve `live/advanced`'in `result[]` öğesi: tek bir SERP. */
interface RawSerpResult {
  item_types?: string[] | null;
  items?: RawOrganicItem[] | null;
}

interface RawLocation {
  location_code: number;
  location_name: string;
  country_iso_code: string | null;
}

interface RawLanguage {
  language_code: string;
  language_name: string;
}

interface RawKeywordVolume {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
}

function toTaskPostBody(
  item: DfsSerpTaskPostItem | DfsSerpLiveTask,
): Record<string, unknown> {
  return {
    keyword: item.keyword,
    location_code: item.locationCode,
    language_code: item.languageCode,
    device: item.device,
    depth: item.depth,
    tag: item.tag,
  };
}

function toTaskPostResult(
  task: DataForSeoTask<unknown>,
): DfsSerpTaskPostResult {
  return {
    id: task.id,
    statusCode: task.status_code,
    statusMessage: task.status_message,
    cost: task.cost,
    tag: (task.data?.tag as string | undefined) ?? null,
  };
}

function toAdvancedResult(
  task: DataForSeoTask<RawSerpResult>,
): DfsSerpAdvancedResult {
  const serps = task.result ?? [];
  const items: DfsSerpOrganicItem[] = serps
    .flatMap((serp) => serp.items ?? [])
    .map((item) => ({
      type: item.type,
      rankGroup: item.rank_group ?? null,
      rankAbsolute: item.rank_absolute ?? null,
      domain: item.domain ?? null,
      url: item.url ?? null,
      title: item.title ?? null,
    }));
  const itemTypes = [
    ...new Set(serps.flatMap((serp) => serp.item_types ?? [])),
  ];
  return {
    id: task.id,
    statusCode: task.status_code,
    statusMessage: task.status_message,
    cost: task.cost,
    tag: (task.data?.tag as string | undefined) ?? null,
    itemTypes,
    items,
  };
}

/** Task-level maliyetler varsa toplanır (mikro birim üzerinden); yoksa top-level `cost`. */
function sumTaskCosts(
  tasks: DataForSeoTask<unknown>[],
  topLevelCost: number,
): number {
  if (tasks.length === 0) {
    return topLevelCost;
  }
  const micros = tasks.reduce(
    (sum, task) => sum + Math.round((task.cost ?? 0) * 1_000_000),
    0,
  );
  return micros / 1_000_000;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }
}

function toConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }
  return new ConnectorTransientError('DataForSEO isteğinde ağ hatası.', error);
}
