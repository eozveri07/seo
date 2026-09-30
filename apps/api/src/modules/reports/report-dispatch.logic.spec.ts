import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportType } from './entities/report.entity';
import {
  fireDateInTimezone,
  isScheduleDue,
  resolveSchedulePeriod,
} from './report-dispatch.logic';

function schedule(overrides: Partial<ReportSchedule> = {}): ReportSchedule {
  return {
    cron: '0 9 * * 1',
    timezone: 'Europe/Istanbul',
    type: ReportType.Weekly,
    ...overrides,
  } as ReportSchedule;
}

describe('isScheduleDue', () => {
  // Pazartesi 09:00 Europe/Istanbul = 06:00 UTC.
  it('cron tam ateşlendiği saatte (timezone dönüştürülerek) due döner', () => {
    const due = isScheduleDue(schedule(), new Date('2026-09-28T06:05:00Z'));
    expect(due).toBe(true);
  });

  it('ateşlenme saatinden önce due değildir', () => {
    const due = isScheduleDue(schedule(), new Date('2026-09-28T05:55:00Z'));
    expect(due).toBe(false);
  });

  it('ateşlenme penceresi (1 saat) geçtikten sonra tekrar due değildir (tek sefer tetikleme)', () => {
    const due = isScheduleDue(schedule(), new Date('2026-09-28T07:05:00Z'));
    expect(due).toBe(false);
  });

  it("farklı timezone'ler doğru UTC saatine çevrilir (ör. America/New_York)", () => {
    // Pazartesi 09:00 America/New_York (EDT, UTC-4) = 13:00 UTC.
    const due = isScheduleDue(
      schedule({ timezone: 'America/New_York' }),
      new Date('2026-09-28T13:05:00Z'),
    );
    expect(due).toBe(true);
  });
});

describe('fireDateInTimezone', () => {
  it("cron tetiklendiği anı schedule timezone'undaki güne çevirir", () => {
    const date = fireDateInTimezone(
      schedule(),
      new Date('2026-09-28T06:05:00Z'),
    );
    expect(date).toBe('2026-09-28');
  });
});

describe('resolveSchedulePeriod', () => {
  it('weekly: bir önceki tam hafta (Pzt-Paz)', () => {
    const period = resolveSchedulePeriod(ReportType.Weekly, '2026-09-28');
    expect(period).toEqual({
      periodStart: '2026-09-21',
      periodEnd: '2026-09-27',
    });
  });

  it('monthly: bir önceki tam ay', () => {
    const period = resolveSchedulePeriod(ReportType.Monthly, '2026-10-01');
    expect(period).toEqual({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
  });
});
