import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { ApiUsageProvider } from '../../modules/usage/entities/api-usage.entity';
import { UsageService } from '../../modules/usage/usage.service';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
  ConnectorTransientError,
} from '../errors';
import {
  SERP_FIXTURE_TAG,
  SERP_FIXTURE_TASK_ID,
  serpTaskGetAdvancedFixture,
} from './__fixtures__/serp-task-get-advanced.fixture';
import { DataForSeoClient } from './dataforseo.client';
import { DfsSerpTaskPostItem } from './dataforseo.types';

function buildConfigService(
  values: Partial<Record<string, string>> = {
    DFS_LOGIN: 'login@example.com',
    DFS_PASSWORD: 'secret',
  },
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key],
  } as ConfigService<EnvironmentVariables, true>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function envelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: '0.1',
    status_code: 20000,
    status_message: 'Ok.',
    time: '0 sec.',
    cost: 0.002,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'task-1',
        status_code: 20000,
        status_message: 'Ok.',
        time: '0 sec.',
        cost: 0.002,
        result_count: 1,
        path: [],
        data: { tag: 'kw-1' },
        result: [],
      },
    ],
    ...overrides,
  };
}

function buildClient(
  options: {
    fetchFn?: jest.Mock;
    configValues?: Partial<Record<string, string>>;
  } = {},
) {
  const record = jest.fn().mockResolvedValue(undefined);
  const usageService = { record } as unknown as UsageService;
  const client = new DataForSeoClient(
    buildConfigService(options.configValues),
    usageService,
    {
      fetchFn: (options.fetchFn ?? jest.fn()) as unknown as typeof fetch,
      sleepFn: jest.fn().mockResolvedValue(undefined),
      maxRetries: 2,
      retryDelaysMs: [1, 1],
    },
  );
  return { client, usageService: { record }, fetchFn: options.fetchFn };
}

const TASKS: DfsSerpTaskPostItem[] = Array.from(
  { length: 150 },
  (_, index) => ({
    keyword: `kw-${index}`,
    locationCode: 2792,
    languageCode: 'tr',
    tag: `tag-${index}`,
  }),
);

describe('DataForSeoClient', () => {
  it('DFS_LOGIN/DFS_PASSWORD tanımsızsa ConnectorAuthError fırlatır ve fetch yapmaz', async () => {
    const fetchFn = jest.fn();
    const { client } = buildClient({ fetchFn, configValues: {} });

    await expect(client.serpTasksReady()).rejects.toThrow(ConnectorAuthError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Basic auth header ile istek atar', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(envelope()));
    const { client } = buildClient({ fetchFn });

    await client.serpTasksReady();

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('login@example.com:secret').toString('base64')}`,
    );
  });

  it('top-level status_code 20000 değilse ConnectorPermanentError fırlatır', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(
          envelope({ status_code: 40001, status_message: 'Bad request.' }),
        ),
      );
    const { client } = buildClient({ fetchFn });

    await expect(client.serpTasksReady()).rejects.toThrow(
      ConnectorPermanentError,
    );
  });

  it('top-level status_code >= 50000 ise ConnectorTransientError olarak sınıflandırır ve yeniden dener', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({ status_code: 50000, status_message: 'Internal error.' }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(envelope()));
    const { client } = buildClient({ fetchFn });

    const result = await client.serpTasksReady();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('HTTP 429 ConnectorQuotaError olarak sınıflandırılır ve yeniden dener', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(envelope()));
    const { client } = buildClient({ fetchFn });

    const result = await client.serpTasksReady();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('HTTP 401 ConnectorAuthError olarak sınıflandırılır ve yeniden denemez', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}, 401));
    const { client } = buildClient({ fetchFn });

    await expect(client.serpTasksReady()).rejects.toThrow(ConnectorAuthError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('tüm denemeler tükenirse son hatayı fırlatır', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}, 503));
    const { client } = buildClient({ fetchFn });

    await expect(client.serpTasksReady()).rejects.toThrow(
      ConnectorTransientError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('serpTaskPost 150 task’ı 100’lük iki isteğe böler ve tag alanını taşır', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(envelope()));
    const { client, usageService } = buildClient({ fetchFn });

    const results = await client.serpTaskPost(TASKS);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchFn.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(firstInit.body as string) as Array<{
      tag: string;
    }>;
    expect(firstBody).toHaveLength(100);
    const [, secondInit] = fetchFn.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(secondInit.body as string) as Array<{
      tag: string;
    }>;
    expect(secondBody).toHaveLength(50);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 'task-1', tag: 'kw-1' });
    expect(usageService.record).toHaveBeenCalledTimes(2);
  });

  it('serpTaskPost her istekte maliyeti UsageService ile kaydeder', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse(
        envelope({
          cost: 0.005,
          tasks: [
            {
              id: 'task-1',
              status_code: 20000,
              status_message: 'Ok.',
              time: '0 sec.',
              cost: 0.002,
              result_count: 0,
              path: [],
              data: {},
              result: [],
            },
            {
              id: 'task-2',
              status_code: 20000,
              status_message: 'Ok.',
              time: '0 sec.',
              cost: 0.0015,
              result_count: 0,
              path: [],
              data: {},
              result: [],
            },
          ],
        }),
      ),
    );
    const { client, usageService } = buildClient({ fetchFn });

    await client.serpTaskPost(TASKS.slice(0, 2), {
      orgId: 'org-1',
      projectId: 'project-1',
      jobRunId: 'run-1',
    });

    expect(usageService.record).toHaveBeenCalledWith({
      provider: ApiUsageProvider.DataForSeo,
      endpoint: 'serp/google/organic/task_post',
      units: 2,
      cost: 0.0035,
      orgId: 'org-1',
      projectId: 'project-1',
      jobRunId: 'run-1',
    });
  });

  it("serpTaskGetAdvanced SERP öğelerini ve item_types'ı tipli döner", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse(serpTaskGetAdvancedFixture()));
    const { client } = buildClient({ fetchFn });

    const result = await client.serpTaskGetAdvanced(SERP_FIXTURE_TASK_ID);

    expect(result).toMatchObject({
      id: SERP_FIXTURE_TASK_ID,
      statusCode: 20000,
      tag: SERP_FIXTURE_TAG,
      itemTypes: ['paid', 'featured_snippet', 'organic', 'people_also_ask'],
    });
    expect(result?.items).toHaveLength(14);
    expect(result?.items[5]).toEqual({
      type: 'organic',
      rankGroup: 3,
      rankAbsolute: 6,
      domain: 'blog.example.com',
      url: 'https://blog.example.com/seo-araclari/',
      title: 'blog.example.com başlığı',
    });
    // people_also_ask'ın domain/url'i yok; null'a çevrilir.
    expect(result?.items[4]).toMatchObject({
      type: 'people_also_ask',
      domain: null,
      url: null,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${SERP_FIXTURE_TASK_ID}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('locations ve languages ücretsizdir; UsageService çağrılmaz', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            tasks: [
              {
                id: 't',
                status_code: 20000,
                status_message: 'Ok.',
                time: '0',
                cost: 0,
                result_count: 1,
                path: [],
                data: null,
                result: [
                  {
                    location_code: 2792,
                    location_name: 'Turkey',
                    country_iso_code: 'TR',
                  },
                ],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            tasks: [
              {
                id: 't',
                status_code: 20000,
                status_message: 'Ok.',
                time: '0',
                cost: 0,
                result_count: 1,
                path: [],
                data: null,
                result: [{ language_code: 'tr', language_name: 'Turkish' }],
              },
            ],
          }),
        ),
      );
    const { client, usageService } = buildClient({ fetchFn });

    const locations = await client.locations();
    const languages = await client.languages();

    expect(locations).toEqual([
      { locationCode: 2792, locationName: 'Turkey', countryIsoCode: 'TR' },
    ]);
    expect(languages).toEqual([
      { languageCode: 'tr', languageName: 'Turkish' },
    ]);
    expect(usageService.record).not.toHaveBeenCalled();
  });

  it('keywordSearchVolume hacim ve cpc döner, maliyeti kaydeder', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse(
        envelope({
          cost: 0.01,
          tasks: [
            {
              id: 't',
              status_code: 20000,
              status_message: 'Ok.',
              time: '0',
              cost: 0.01,
              result_count: 1,
              path: [],
              data: null,
              result: [{ keyword: 'seo aracı', search_volume: 880, cpc: 3.2 }],
            },
          ],
        }),
      ),
    );
    const { client, usageService } = buildClient({ fetchFn });

    const result = await client.keywordSearchVolume(['seo aracı'], 2792, 'tr');

    expect(result).toEqual([
      { keyword: 'seo aracı', searchVolume: 880, cpc: 3.2 },
    ]);
    expect(usageService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'keywords_data/google_ads/search_volume/live',
        units: 1,
        cost: 0.01,
      }),
    );
  });
});
