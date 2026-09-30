import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../errors';
import { GscClient } from './gsc.client';

const sitesList = jest.fn();
const searchanalyticsQuery = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { JWT: jest.fn() },
    searchconsole: jest.fn(() => ({
      sites: { list: sitesList },
      searchanalytics: { query: searchanalyticsQuery },
    })),
  },
}));

const SA_JSON_BASE64 = Buffer.from(
  JSON.stringify({
    client_email: 'sa@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  }),
).toString('base64');

function buildConfigService(
  values: Partial<Record<string, string>> = {
    GOOGLE_SA_JSON_BASE64: SA_JSON_BASE64,
  },
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key],
  } as ConfigService<EnvironmentVariables, true>;
}

describe('GscClient', () => {
  beforeEach(() => {
    sitesList.mockReset();
    searchanalyticsQuery.mockReset();
  });

  describe('getServiceAccountEmail', () => {
    it('GOOGLE_SA_JSON_BASE64 tanımsızsa ConnectorAuthError fırlatır', () => {
      const client = new GscClient(buildConfigService({}));

      expect(() => client.getServiceAccountEmail()).toThrow(ConnectorAuthError);
    });

    it('service account e-postasını döner', () => {
      const client = new GscClient(buildConfigService());

      expect(client.getServiceAccountEmail()).toBe(
        'sa@example.iam.gserviceaccount.com',
      );
    });
  });

  describe('verifyProperty', () => {
    it("property sites.list'te ve yetki yeterliyse hata fırlatmaz", async () => {
      sitesList.mockResolvedValue({
        data: {
          siteEntry: [
            { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
          ],
        },
      });
      const client = new GscClient(buildConfigService());

      await expect(
        client.verifyProperty('sc-domain:example.com'),
      ).resolves.toBeUndefined();
    });

    it('property listede yoksa ConnectorPermanentError fırlatır', async () => {
      sitesList.mockResolvedValue({ data: { siteEntry: [] } });
      const client = new GscClient(buildConfigService());

      await expect(
        client.verifyProperty('sc-domain:example.com'),
      ).rejects.toBeInstanceOf(ConnectorPermanentError);
    });

    it('yetki seviyesi yetersizse (siteUnverifiedUser) ConnectorPermanentError fırlatır', async () => {
      sitesList.mockResolvedValue({
        data: {
          siteEntry: [
            {
              siteUrl: 'sc-domain:example.com',
              permissionLevel: 'siteUnverifiedUser',
            },
          ],
        },
      });
      const client = new GscClient(buildConfigService());

      await expect(
        client.verifyProperty('sc-domain:example.com'),
      ).rejects.toBeInstanceOf(ConnectorPermanentError);
    });
  });

  describe('hata sınıflandırması', () => {
    it('401 -> ConnectorAuthError', async () => {
      sitesList.mockRejectedValue({ code: 401, message: 'Unauthorized' });
      const client = new GscClient(buildConfigService());

      await expect(client.listSites()).rejects.toBeInstanceOf(
        ConnectorAuthError,
      );
    });

    it('429 -> ConnectorQuotaError', async () => {
      sitesList.mockRejectedValue({ code: 429, message: 'Rate limit' });
      const client = new GscClient(buildConfigService());

      await expect(client.listSites()).rejects.toBeInstanceOf(
        ConnectorQuotaError,
      );
    });

    it('500 -> ConnectorTransientError', async () => {
      sitesList.mockRejectedValue({ code: 500, message: 'Server error' });
      const client = new GscClient(buildConfigService());

      await expect(client.listSites()).rejects.toBeInstanceOf(
        ConnectorTransientError,
      );
    });

    it('400 -> ConnectorPermanentError', async () => {
      sitesList.mockRejectedValue({ code: 400, message: 'Bad request' });
      const client = new GscClient(buildConfigService());

      await expect(client.listSites()).rejects.toBeInstanceOf(
        ConnectorPermanentError,
      );
    });

    it('status yoksa (ağ hatası) ConnectorTransientError', async () => {
      sitesList.mockRejectedValue(new Error('network down'));
      const client = new GscClient(buildConfigService());

      await expect(client.listSites()).rejects.toBeInstanceOf(
        ConnectorTransientError,
      );
    });
  });

  describe('searchAnalyticsQuery', () => {
    it('satırları tipli döner', async () => {
      searchanalyticsQuery.mockResolvedValue({
        data: {
          rows: [
            {
              keys: ['2024-01-01'],
              clicks: 3,
              impressions: 10,
              ctr: 0.3,
              position: 4.2,
            },
          ],
        },
      });
      const client = new GscClient(buildConfigService());

      const rows = await client.searchAnalyticsQuery({
        siteUrl: 'sc-domain:example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        dimensions: ['date'],
      });

      expect(rows).toEqual([
        {
          keys: ['2024-01-01'],
          clicks: 3,
          impressions: 10,
          ctr: 0.3,
          position: 4.2,
        },
      ]);
    });
  });
});
