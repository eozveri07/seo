import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../../common/cls-store';
import { InvalidReportTokenError } from '../reports.errors';
import { ReportTokenService } from '../report-token.service';

/**
 * Yalnız `GET /reports/:id/data` için (ARCHITECTURE §12): `JwtAuthGuard` ve
 * `TenantGuard`'dan bağımsız çalışır (o endpoint `@Public()` ve
 * `@SkipTenant()`'tır). Token query'den okunur, scope'u `:id`'ye eşit
 * olmalıdır; doğrulanınca token'daki `orgId` CLS'e yazılır.
 */
@Injectable()
export class ReportTokenGuard implements CanActivate {
  constructor(
    private readonly reportTokenService: ReportTokenService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      query: Record<string, unknown>;
    }>();
    const reportId = request.params?.id;
    const token = request.query?.token;
    if (!reportId || typeof token !== 'string' || !token) {
      throw new InvalidReportTokenError();
    }

    const payload = this.reportTokenService.verify(token, reportId);
    this.cls.set('orgId', payload.orgId);
    return true;
  }
}
