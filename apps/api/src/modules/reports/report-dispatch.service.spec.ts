import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportType } from './entities/report.entity';
import { ReportDispatchService } from './report-dispatch.service';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportsService } from './reports.service';

// Pazartesi 09:00 Europe/Istanbul = 06:00 UTC.
const DUE_NOW = new Date('2026-09-28T06:05:00Z');
const NOT_DUE_NOW = new Date('2026-09-28T08:00:00Z');

function schedule(overrides: Partial<ReportSchedule> = {}): ReportSchedule {
  return {
    id: 'schedule-1',
    orgId: 'org-1',
    projectId: 'project-1',
    type: ReportType.Weekly,
    cron: '0 9 * * 1',
    timezone: 'Europe/Istanbul',
    recipients: ['client@example.com'],
    isActive: true,
    ...overrides,
  } as ReportSchedule;
}

function setup(schedules: ReportSchedule[]) {
  const cls = {
    run: <T>(_options: unknown, callback: () => T): T => callback(),
    set: jest.fn(),
  } as unknown as ClsService<AppClsStore>;
  const schedulesService = {
    listAllActive: jest.fn().mockResolvedValue(schedules),
  };
  const reportsService = {
    createFromSchedule: jest
      .fn()
      .mockResolvedValue({ created: true, reportId: 'report-1' }),
  };
  const service = new ReportDispatchService(
    schedulesService as unknown as ReportSchedulesService,
    reportsService as unknown as ReportsService,
    cls,
  );
  return { service, schedulesService, reportsService };
}

describe('ReportDispatchService.dispatch', () => {
  it('zamanı gelen schedule için raporu bir kez tetikler', async () => {
    const { service, reportsService } = setup([schedule()]);

    const stats = await service.dispatch(DUE_NOW);

    expect(stats).toEqual({ checked: 1, dispatched: 1 });
    expect(reportsService.createFromSchedule).toHaveBeenCalledTimes(1);
    expect(reportsService.createFromSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'schedule-1' }),
      { periodStart: '2026-09-21', periodEnd: '2026-09-27' },
    );
  });

  it("zamanı gelmemiş schedule'ı tetiklemez", async () => {
    const { service, reportsService } = setup([schedule()]);

    const stats = await service.dispatch(NOT_DUE_NOW);

    expect(stats).toEqual({ checked: 1, dispatched: 0 });
    expect(reportsService.createFromSchedule).not.toHaveBeenCalled();
  });

  it("aynı saat içinde iki kez çalıştırılırsa (ör. worker yeniden başlarsa), ikinci çağrı createFromSchedule'ın DB idempotency kontrolüne düşer ve dispatched artmaz", async () => {
    const { service, reportsService } = setup([schedule()]);
    reportsService.createFromSchedule
      .mockResolvedValueOnce({ created: true, reportId: 'report-1' })
      .mockResolvedValueOnce({ created: false, reportId: 'report-1' });

    const first = await service.dispatch(DUE_NOW);
    const second = await service.dispatch(DUE_NOW);

    expect(reportsService.createFromSchedule).toHaveBeenCalledTimes(2);
    expect(first.dispatched).toBe(1);
    expect(second.dispatched).toBe(0);
  });

  it('createFromSchedule zaten var olan raporu bulursa dispatched sayılmaz', async () => {
    const { service, reportsService } = setup([schedule()]);
    reportsService.createFromSchedule.mockResolvedValue({
      created: false,
      reportId: 'existing',
    });

    const stats = await service.dispatch(DUE_NOW);

    expect(stats).toEqual({ checked: 1, dispatched: 0 });
  });
});
