import {
  addDays,
  addMonths,
  dateRange,
  daysInclusive,
  isIsoDate,
  todayUtc,
} from './utc-date';

describe('utc-date', () => {
  it('isIsoDate yalnız geçerli YYYY-MM-DD günlerini kabul eder', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('2026-02-28T00:00:00Z')).toBe(false);
  });

  it('todayUtc UTC gününü döner', () => {
    expect(todayUtc(new Date('2026-09-30T23:59:59+02:00'))).toBe('2026-09-30');
  });

  it('addDays ay ve yıl sınırını geçer', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('addMonths ay sonunu kırpar', () => {
    expect(addMonths('2026-09-30', -16)).toBe('2025-05-30');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('daysInclusive ve dateRange uçları dahil eder', () => {
    expect(daysInclusive('2026-09-01', '2026-09-03')).toBe(3);
    expect(daysInclusive('2026-09-03', '2026-09-01')).toBe(0);
    expect(dateRange('2026-08-30', '2026-09-01')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ]);
  });
});
