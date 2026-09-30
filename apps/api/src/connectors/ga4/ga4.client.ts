import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { EnvironmentVariables } from '../../config/environment-variables';
import { loadGoogleServiceAccount } from '../google-service-account';
import { classifyGa4Error } from './ga4.errors';

export interface Ga4RunReportParams {
  property: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  limit?: number;
  offset?: number;
}

export interface Ga4RunReportResult {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: { dimensionValues: string[]; metricValues: string[] }[];
}

/**
 * ARCHITECTURE §9.2: GA4 Data API erişimi. Metrik/dimension isimleri
 * `runReport`'u çağıran koda aittir (sync processor'ları); bu client sadece
 * tipli bir çağrı katmanıdır (CLAUDE.md kural 5).
 */
@Injectable()
export class Ga4Client {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Property için 1 günlük basit bir rapor çekerek erişimi doğrular. */
  async verifyProperty(propertyId: string): Promise<void> {
    await this.runReport({
      property: propertyId,
      startDate: 'yesterday',
      endDate: 'yesterday',
      dimensions: ['date'],
      metrics: ['sessions'],
      limit: 1,
    });
  }

  async runReport(params: Ga4RunReportParams): Promise<Ga4RunReportResult> {
    try {
      const client = this.getClient();
      const [response] = await client.runReport({
        property: params.property,
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: params.dimensions.map((name) => ({ name })),
        metrics: params.metrics.map((name) => ({ name })),
        limit: params.limit ?? 100000,
        offset: params.offset ?? 0,
      });
      return {
        dimensionHeaders: (response.dimensionHeaders ?? []).map(
          (header) => header.name ?? '',
        ),
        metricHeaders: (response.metricHeaders ?? []).map(
          (header) => header.name ?? '',
        ),
        rows: (response.rows ?? []).map((row) => ({
          dimensionValues: (row.dimensionValues ?? []).map(
            (value) => value.value ?? '',
          ),
          metricValues: (row.metricValues ?? []).map(
            (value) => value.value ?? '',
          ),
        })),
      };
    } catch (error) {
      throw classifyGa4Error(error);
    }
  }

  private getClient(): BetaAnalyticsDataClient {
    const credentials = loadGoogleServiceAccount(this.configService);
    return new BetaAnalyticsDataClient({
      credentials: {
        client_email: credentials.clientEmail,
        private_key: credentials.privateKey,
      },
    });
  }
}
