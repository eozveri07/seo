import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  sign,
  verify,
  JsonWebTokenError,
  TokenExpiredError,
} from 'jsonwebtoken';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  InvalidReportTokenError,
  ReportTokenSecretMissingError,
} from './reports.errors';

/** `GET /reports/:id/data` için imzalı, kısa ömürlü token (ARCHITECTURE §12). */
const REPORT_TOKEN_TTL_SECONDS = 10 * 60;

export interface ReportTokenPayload {
  scope: string;
  orgId: string;
}

function reportTokenScope(reportId: string): string {
  return `report:${reportId}`;
}

/**
 * `REPORT_TOKEN_SECRET` ile imzalı JWT (ARCHITECTURE §12): 10 dakika,
 * scope `report:{id}`. `JwtAuthGuard`'ın access token'ından ayrı bir
 * secret ve doğrulama yolu kullanır; yalnız `ReportTokenGuard` okur.
 */
@Injectable()
export class ReportTokenService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  sign(reportId: string, orgId: string): string {
    return sign({ scope: reportTokenScope(reportId), orgId }, this.secret(), {
      expiresIn: REPORT_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
    });
  }

  /** Token'ın verilen `reportId`'nin scope'una ait olduğunu doğrular. */
  verify(token: string, reportId: string): ReportTokenPayload {
    let payload: ReportTokenPayload;
    try {
      payload = verify(token, this.secret(), {
        algorithms: ['HS256'],
      }) as unknown as ReportTokenPayload;
    } catch (error) {
      if (
        error instanceof JsonWebTokenError ||
        error instanceof TokenExpiredError
      ) {
        throw new InvalidReportTokenError();
      }
      throw error;
    }
    if (payload.scope !== reportTokenScope(reportId) || !payload.orgId) {
      throw new InvalidReportTokenError();
    }
    return payload;
  }

  private secret(): string {
    const secret = this.configService.get('REPORT_TOKEN_SECRET', {
      infer: true,
    });
    if (!secret) {
      throw new ReportTokenSecretMissingError();
    }
    return secret;
  }
}
