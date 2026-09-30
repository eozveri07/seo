/**
 * `YYYY-MM-DD` (UTC) gün yardımcıları. GSC ve günlük metrikler `date`
 * kolonunda saklanır; Faz 1'de "gün" global UTC'dir (ARCHITECTURE §8.1).
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayUtc(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(isoDate).getTime() + days * DAY_MS));
}

/** Ay sonu taşmasında (31 Mart - 1 ay) ayın son gününe kırpar. */
export function addMonths(isoDate: string, months: number): string {
  const date = parseIsoDate(isoDate);
  const day = date.getUTCDate();
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(target);
}

/** `from` ve `to` dahil gün sayısı; `to < from` ise 0. */
export function daysInclusive(from: string, to: string): number {
  const diff =
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS;
  return diff < 0 ? 0 : diff + 1;
}

/** `from`'dan `to`'ya (dahil) artan sırada günler. */
export function dateRange(from: string, to: string): string[] {
  const count = daysInclusive(from, to);
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

function parseIsoDate(isoDate: string): Date {
  if (!isIsoDate(isoDate)) {
    throw new Error(`Geçersiz tarih (YYYY-MM-DD bekleniyor): ${isoDate}`);
  }
  return new Date(`${isoDate}T00:00:00Z`);
}
