import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, searchconsole_v1 } from 'googleapis';
import { EnvironmentVariables } from '../../config/environment-variables';
import { loadGoogleServiceAccount } from '../google-service-account';
import { ConnectorPermanentError } from '../errors';
import { classifyGscError } from './gsc.errors';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

/** `sites.list`'te data erişimi için yetersiz sayılan seviye. */
const INSUFFICIENT_PERMISSION_LEVELS = new Set(['siteUnverifiedUser']);

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscSearchAnalyticsQueryParams {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
  dataState?: 'all' | 'final';
}

export interface GscSearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * ARCHITECTURE §9.1: Search Console erişimi. İş mantığı içermez (CLAUDE.md
 * kural 5); yalnız `googleapis` üzerinden tipli çağrılar ve hata sınıflandırması.
 */
@Injectable()
export class GscClient {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  getServiceAccountEmail(): string {
    return loadGoogleServiceAccount(this.configService).clientEmail;
  }

  async listSites(): Promise<GscSite[]> {
    try {
      const client = this.getClient();
      const response = await client.sites.list();
      return (response.data.siteEntry ?? []).map((entry) => ({
        siteUrl: entry.siteUrl ?? '',
        permissionLevel: entry.permissionLevel ?? 'siteUnverifiedUser',
      }));
    } catch (error) {
      throw classifyGscError(error);
    }
  }

  /** `external_id`'nin `sites.list`'te olduğunu ve yetki seviyesinin yeterli olduğunu doğrular. */
  async verifyProperty(externalId: string): Promise<void> {
    const sites = await this.listSites();
    const site = sites.find((entry) => entry.siteUrl === externalId);
    if (!site) {
      throw new ConnectorPermanentError(
        `Service account (${this.getServiceAccountEmail()}) bu property'ye eklenmemiş: ${externalId}`,
      );
    }
    if (INSUFFICIENT_PERMISSION_LEVELS.has(site.permissionLevel)) {
      throw new ConnectorPermanentError(
        `Service account'un yetki seviyesi yetersiz (${site.permissionLevel}): ${externalId}`,
      );
    }
  }

  async searchAnalyticsQuery(
    params: GscSearchAnalyticsQueryParams,
  ): Promise<GscSearchAnalyticsRow[]> {
    try {
      const client = this.getClient();
      const response = await client.searchanalytics.query({
        siteUrl: params.siteUrl,
        requestBody: {
          startDate: params.startDate,
          endDate: params.endDate,
          dimensions: params.dimensions,
          rowLimit: params.rowLimit ?? 25000,
          startRow: params.startRow ?? 0,
          dataState: params.dataState ?? 'all',
        },
      });
      return (response.data.rows ?? []).map((row) => ({
        keys: row.keys ?? [],
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      }));
    } catch (error) {
      throw classifyGscError(error);
    }
  }

  private getClient(): searchconsole_v1.Searchconsole {
    const credentials = loadGoogleServiceAccount(this.configService);
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: SCOPES,
    });
    return google.searchconsole({ version: 'v1', auth });
  }
}
