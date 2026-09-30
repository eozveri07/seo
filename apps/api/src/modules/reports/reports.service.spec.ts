import { TenantRepository } from '../../common/tenancy/tenant.repository';
import type { StorageService } from '../../infra/storage/storage.interface';
import { JobRunsService } from '../jobs/job-runs.service';
import { Report, ReportStatus, ReportType } from './entities/report.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportsService } from './reports.service';

function setup() {
  let idCounter = 0;
  const reports = {
    findOneBy: jest.fn(),
    save: jest.fn((entity: Partial<Report>) =>
      Promise.resolve({ id: `report-${++idCounter}`, ...entity } as Report),
    ),
    createQueryBuilder: jest.fn(),
  };
  const jobRuns = {
    createQueued: jest.fn().mockResolvedValue({ id: 'run-1' }),
    attachBullmqJob: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const reportQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const storage: Partial<StorageService> = {};

  const service = new ReportsService(
    reports as unknown as TenantRepository<Report>,
    jobRuns as unknown as JobRunsService,
    reportQueue as never,
    storage as StorageService,
  );

  return { service, reports, jobRuns, reportQueue };
}

const SCHEDULE: ReportSchedule = {
  id: 'schedule-1',
  orgId: 'org-1',
  projectId: 'project-1',
  type: ReportType.Weekly,
  cron: '0 9 * * 1',
  timezone: 'Europe/Istanbul',
  recipients: ['client@example.com'],
  isActive: true,
} as ReportSchedule;

const PERIOD = { periodStart: '2026-09-21', periodEnd: '2026-09-27' };

describe('ReportsService.createFromSchedule', () => {
  it('dönem için rapor yoksa oluşturur ve deterministik jobId ile kuyruğa ekler', async () => {
    const { service, reports, reportQueue } = setup();
    reports.findOneBy.mockResolvedValueOnce(null);

    const result = await service.createFromSchedule(SCHEDULE, PERIOD);

    expect(result.created).toBe(true);
    expect(reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        type: ReportType.Weekly,
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        status: ReportStatus.Queued,
        sentTo: ['client@example.com'],
      }),
    );
    expect(reportQueue.add).toHaveBeenCalledWith(
      'report',
      expect.objectContaining({ orgId: 'org-1', projectId: 'project-1' }),
      { jobId: 'report-sched:schedule-1:2026-09-21' },
    );
  });

  it('aynı dönem için zaten bir rapor varsa ikinci kez oluşturmaz (idempotency)', async () => {
    const { service, reports, reportQueue } = setup();
    reports.findOneBy.mockResolvedValueOnce({ id: 'existing-report' });

    const result = await service.createFromSchedule(SCHEDULE, PERIOD);

    expect(result).toEqual({ created: false, reportId: 'existing-report' });
    expect(reports.save).not.toHaveBeenCalled();
    expect(reportQueue.add).not.toHaveBeenCalled();
  });

  it('art arda iki çağrı: ilki oluşturur, ikincisi (artık var olduğu için) tekrar oluşturmaz', async () => {
    const { service, reports, reportQueue } = setup();
    reports.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'report-1' });

    const first = await service.createFromSchedule(SCHEDULE, PERIOD);
    const second = await service.createFromSchedule(SCHEDULE, PERIOD);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(reports.save).toHaveBeenCalledTimes(1);
    expect(reportQueue.add).toHaveBeenCalledTimes(1);
  });
});
