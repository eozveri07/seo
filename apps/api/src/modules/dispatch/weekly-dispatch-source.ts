import { DispatchItem } from './daily-dispatch-source';

/**
 * `weekly-dispatch`'e (ARCHITECTURE §8.1, pazartesi 04:00 UTC) katılan bir
 * veri kaynağı. Şimdilik yalnız haftalık keyword'lerin rank-post'u.
 */
export interface WeeklyDispatchSource {
  collectWeekly(date: string): Promise<DispatchItem[]>;
}

export const WEEKLY_DISPATCH_SOURCES = Symbol('WEEKLY_DISPATCH_SOURCES');
