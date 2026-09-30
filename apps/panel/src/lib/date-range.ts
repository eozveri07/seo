import { differenceInCalendarDays, format, subDays } from 'date-fns'

export type DateRange = { from: string; to: string }

export function defaultDateRange(days = 28): DateRange {
  const to = new Date()
  const from = subDays(to, days - 1)
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') }
}

/** Seçilen dönemin hemen öncesindeki, aynı uzunluktaki dönem. */
export function previousPeriod(range: DateRange): DateRange {
  const from = new Date(range.from)
  const to = new Date(range.to)
  const lengthDays = differenceInCalendarDays(to, from) + 1
  const prevTo = subDays(from, 1)
  const prevFrom = subDays(prevTo, lengthDays - 1)
  return { from: format(prevFrom, 'yyyy-MM-dd'), to: format(prevTo, 'yyyy-MM-dd') }
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && isoDatePattern.test(value)
}
