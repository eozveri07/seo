import { CronExpressionParser } from 'cron-parser';
import { addDays, addMonths } from '../../common/dates/utc-date';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportType } from './entities/report.entity';

/** `report-dispatch` her saat başı çalışır; bir önceki çalışmadan bu yana geçen pencere. */
export const REPORT_DISPATCH_WINDOW_MS = 60 * 60 * 1000;

/**
 * Bir schedule'ın bu çalıştırmada (saat başı) tetiklenip tetiklenmeyeceği:
 * cron'un `timezone`'a göre bir önceki ateşlenme anı, `[now - 1h, now)`
 * penceresine düşüyorsa evet. Pencere saatlik cron'dan geniş tutulmaz;
 * böylece aynı dönem için yalnız bir kez tetiklenir (idempotency).
 */
export function isScheduleDue(schedule: ReportSchedule, now: Date): boolean {
  const interval = CronExpressionParser.parse(schedule.cron, {
    tz: schedule.timezone,
    currentDate: now,
  });
  const previousFire = interval.prev().toDate();
  const windowStart = new Date(now.getTime() - REPORT_DISPATCH_WINDOW_MS);
  return previousFire >= windowStart && previousFire < now;
}

/**
 * Schedule'ın tipine göre raporlanacak dönem: `fireDate`'den önceki tam
 * hafta (Pzt-Paz) ya da tam ay. `fireDate` cron'un tetiklendiği YYYY-MM-DD
 * (schedule'ın timezone'undaki gün).
 */
export function resolveSchedulePeriod(
  type: ReportType,
  fireDate: string,
): { periodStart: string; periodEnd: string } {
  if (type === ReportType.Monthly) {
    const periodEnd = firstDayOfMonth(fireDate);
    const periodStart = addMonths(periodEnd, -1);
    return { periodStart, periodEnd: addDays(periodEnd, -1) };
  }
  const periodEnd = addDays(fireDate, -1);
  const periodStart = addDays(periodEnd, -6);
  return { periodStart, periodEnd };
}

function firstDayOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Cron'un bu çalıştırmada ateşlendiği an, schedule'ın timezone'undaki güne çevrilir. */
export function fireDateInTimezone(
  schedule: ReportSchedule,
  now: Date,
): string {
  const interval = CronExpressionParser.parse(schedule.cron, {
    tz: schedule.timezone,
    currentDate: now,
  });
  const previousFire = interval.prev().toDate();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(previousFire);
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
