import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../errors';
import { Ga4Client } from './ga4.client';

const runReport = jest.fn();

jest.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: jest.fn().mockImplementation(() => ({ runReport })),
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

describe('Ga4Client', () => {
  beforeEach(() => {
    runReport.mockReset();
  });

  describe('verifyProperty', () => {
    it('GOOGLE_SA_JSON_BASE64 tanımsızsa ConnectorAuthError fırlatır', async () => {
      const client = new Ga4Client(buildConfigService({}));

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorAuthError);
    });

    it('1 günlük rapor başarılıysa hata fırlatmaz', async () => {
      runReport.mockResolvedValue([
        { dimensionHeaders: [], metricHeaders: [], rows: [] },
      ]);
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).resolves.toBeUndefined();
      expect(runReport).toHaveBeenCalledWith(
        expect.objectContaining({ property: 'properties/123' }),
      );
    });
  });

  describe('hata sınıflandırması', () => {
    it('UNAUTHENTICATED (16) -> ConnectorAuthError', async () => {
      runReport.mockRejectedValue({ code: 16, message: 'unauthenticated' });
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorAuthError);
    });

    it('PERMISSION_DENIED (7) -> ConnectorAuthError', async () => {
      runReport.mockRejectedValue({ code: 7, message: 'permission denied' });
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorAuthError);
    });

    it('RESOURCE_EXHAUSTED (8) -> ConnectorQuotaError', async () => {
      runReport.mockRejectedValue({ code: 8, message: 'quota' });
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorQuotaError);
    });

    it('UNAVAILABLE (14) -> ConnectorTransientError', async () => {
      runReport.mockRejectedValue({ code: 14, message: 'unavailable' });
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorTransientError);
    });

    it('diğer kodlar -> ConnectorPermanentError', async () => {
      runReport.mockRejectedValue({ code: 3, message: 'invalid argument' });
      const client = new Ga4Client(buildConfigService());

      await expect(
        client.verifyProperty('properties/123'),
      ).rejects.toBeInstanceOf(ConnectorPermanentError);
    });
  });

  describe('runReport', () => {
    it('sonucu tipli döner', async () => {
      runReport.mockResolvedValue([
        {
          dimensionHeaders: [{ name: 'date' }],
          metricHeaders: [{ name: 'sessions' }],
          rows: [
            {
              dimensionValues: [{ value: '20240101' }],
              metricValues: [{ value: '42' }],
            },
          ],
        },
      ]);
      const client = new Ga4Client(buildConfigService());

      const result = await client.runReport({
        property: 'properties/123',
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        dimensions: ['date'],
        metrics: ['sessions'],
      });

      expect(result).toEqual({
        dimensionHeaders: ['date'],
        metricHeaders: ['sessions'],
        rows: [{ dimensionValues: ['20240101'], metricValues: ['42'] }],
      });
    });
  });
});
