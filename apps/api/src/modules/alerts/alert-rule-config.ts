import { AlertRuleType } from './entities/alert-rule.entity';
import { InvalidAlertRuleConfigError } from './alerts.errors';

/** `{ groupId?, keywordIds?, minDrop, fromTop }` (ARCHITECTURE §11). */
export interface RankDropConfig {
  groupId?: string;
  keywordIds?: string[];
  minDrop: number;
  fromTop: number;
}

/** `{ groupId?, top, days }`. */
export interface RankExitConfig {
  groupId?: string;
  keywordIds?: string[];
  top: number;
  days: number;
}

/** `{ metric, pct, window }`. */
export interface TrafficDropConfig {
  metric: 'clicks' | 'sessions';
  pct: number;
  window: number;
}

/** Sync hatası kuralının ek ayarı yok. */
export type SyncFailureConfig = Record<string, never>;

export type AlertRuleConfig =
  RankDropConfig | RankExitConfig | TrafficDropConfig | SyncFailureConfig;

const TRAFFIC_METRICS = new Set(['clicks', 'sessions']);

/**
 * `config` jsonb'sinin kural tipine göre şeklini doğrular (ARCHITECTURE §11).
 * Panel zod discriminated union ile aynı kuralları istemci tarafında da
 * uygular; burası API'nin son kapısı.
 */
export function validateAlertRuleConfig(
  type: AlertRuleType,
  config: unknown,
): AlertRuleConfig {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new InvalidAlertRuleConfigError('config bir obje olmalı.');
  }
  const value = config as Record<string, unknown>;

  switch (type) {
    case AlertRuleType.RankDrop: {
      const minDrop = value.minDrop;
      const fromTop = value.fromTop;
      if (!isPositiveNumber(minDrop) || !isPositiveNumber(fromTop)) {
        throw new InvalidAlertRuleConfigError(
          'rank_drop: minDrop ve fromTop pozitif sayı olmalı.',
        );
      }
      return {
        groupId: optionalString(value.groupId),
        keywordIds: optionalStringArray(value.keywordIds),
        minDrop,
        fromTop,
      };
    }
    case AlertRuleType.RankExit: {
      const top = value.top;
      const days = value.days;
      if (!isPositiveNumber(top) || !isPositiveNumber(days)) {
        throw new InvalidAlertRuleConfigError(
          'rank_exit: top ve days pozitif sayı olmalı.',
        );
      }
      return {
        groupId: optionalString(value.groupId),
        keywordIds: optionalStringArray(value.keywordIds),
        top,
        days,
      };
    }
    case AlertRuleType.TrafficDrop: {
      const metric = value.metric;
      const pct = value.pct;
      const window = value.window;
      if (typeof metric !== 'string' || !TRAFFIC_METRICS.has(metric)) {
        throw new InvalidAlertRuleConfigError(
          "traffic_drop: metric 'clicks' ya da 'sessions' olmalı.",
        );
      }
      if (!isPositiveNumber(pct) || !isPositiveNumber(window)) {
        throw new InvalidAlertRuleConfigError(
          'traffic_drop: pct ve window pozitif sayı olmalı.',
        );
      }
      return { metric: metric as 'clicks' | 'sessions', pct, window };
    }
    case AlertRuleType.SyncFailure:
      return {};
  }
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}
