import { ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../../common/cls-store';
import { InvalidReportTokenError } from '../reports.errors';
import { ReportTokenService } from '../report-token.service';
import { ReportTokenGuard } from './report-token.guard';

function httpContext(
  params: Record<string, string>,
  query: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ params, query }),
    }),
  } as unknown as ExecutionContext;
}

describe('ReportTokenGuard', () => {
  it("geçerli token: CLS'e orgId yazar ve true döner", () => {
    const verify = jest
      .fn()
      .mockReturnValue({ scope: 'report:report-1', orgId: 'org-1' });
    const cls = { set: jest.fn() };
    const guard = new ReportTokenGuard(
      { verify } as unknown as ReportTokenService,
      cls as unknown as ClsService<AppClsStore>,
    );

    const result = guard.canActivate(
      httpContext({ id: 'report-1' }, { token: 'a.b.c' }),
    );

    expect(result).toBe(true);
    expect(verify).toHaveBeenCalledWith('a.b.c', 'report-1');
    expect(cls.set).toHaveBeenCalledWith('orgId', 'org-1');
  });

  it("token query'de yoksa reddeder", () => {
    const verify = jest.fn();
    const cls = { set: jest.fn() };
    const guard = new ReportTokenGuard(
      { verify } as unknown as ReportTokenService,
      cls as unknown as ClsService<AppClsStore>,
    );

    expect(() =>
      guard.canActivate(httpContext({ id: 'report-1' }, {})),
    ).toThrow(InvalidReportTokenError);
    expect(verify).not.toHaveBeenCalled();
  });

  it("başka rapora ait (ya da geçersiz scope) token'ı reportTokenService reddeder", () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new InvalidReportTokenError();
    });
    const cls = { set: jest.fn() };
    const guard = new ReportTokenGuard(
      { verify } as unknown as ReportTokenService,
      cls as unknown as ClsService<AppClsStore>,
    );

    expect(() =>
      guard.canActivate(httpContext({ id: 'report-2' }, { token: 'a.b.c' })),
    ).toThrow(InvalidReportTokenError);
    expect(cls.set).not.toHaveBeenCalled();
  });
});
