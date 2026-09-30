import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import { EnvironmentVariables } from '../../config/environment-variables';
import { InvalidReportTokenError } from './reports.errors';
import { ReportTokenService } from './report-token.service';

const SECRET = 'a'.repeat(32);

function buildConfigService(
  values: Partial<Record<string, string>> = { REPORT_TOKEN_SECRET: SECRET },
): ConfigService<EnvironmentVariables, true> {
  return { get: (key: string) => values[key] } as ConfigService<
    EnvironmentVariables,
    true
  >;
}

describe('ReportTokenService', () => {
  it("imzaladığı token'ı aynı reportId için doğrular ve orgId'yi döner", () => {
    const service = new ReportTokenService(buildConfigService());
    const token = service.sign('report-1', 'org-1');

    const payload = service.verify(token, 'report-1');

    expect(payload.orgId).toBe('org-1');
  });

  it("başka bir raporun id'siyle doğrulanınca reddeder", () => {
    const service = new ReportTokenService(buildConfigService());
    const token = service.sign('report-1', 'org-1');

    expect(() => service.verify(token, 'report-2')).toThrow(
      InvalidReportTokenError,
    );
  });

  it("süresi dolmuş token'ı reddeder", () => {
    const service = new ReportTokenService(buildConfigService());
    const expiredToken = sign(
      { scope: 'report:report-1', orgId: 'org-1' },
      SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );

    expect(() => service.verify(expiredToken, 'report-1')).toThrow(
      InvalidReportTokenError,
    );
  });

  it("farklı bir secret ile imzalanmış token'ı reddeder", () => {
    const service = new ReportTokenService(buildConfigService());
    const foreignToken = sign(
      { scope: 'report:report-1', orgId: 'org-1' },
      'b'.repeat(32),
      { algorithm: 'HS256', expiresIn: 600 },
    );

    expect(() => service.verify(foreignToken, 'report-1')).toThrow(
      InvalidReportTokenError,
    );
  });

  it("bozuk bir token'ı reddeder", () => {
    const service = new ReportTokenService(buildConfigService());

    expect(() => service.verify('not-a-jwt', 'report-1')).toThrow(
      InvalidReportTokenError,
    );
  });
});
