import { AlertRuleType } from './entities/alert-rule.entity';
import { validateAlertRuleConfig } from './alert-rule-config';
import { InvalidAlertRuleConfigError } from './alerts.errors';

describe('validateAlertRuleConfig', () => {
  it('rank_drop: minDrop ve fromTop zorunlu, opsiyonel alanlar korunur', () => {
    const config = validateAlertRuleConfig(AlertRuleType.RankDrop, {
      minDrop: 3,
      fromTop: 10,
      groupId: 'g-1',
      keywordIds: ['k-1', 'k-2'],
    });

    expect(config).toEqual({
      minDrop: 3,
      fromTop: 10,
      groupId: 'g-1',
      keywordIds: ['k-1', 'k-2'],
    });
  });

  it('rank_drop: minDrop eksikse hata', () => {
    expect(() =>
      validateAlertRuleConfig(AlertRuleType.RankDrop, { fromTop: 10 }),
    ).toThrow(InvalidAlertRuleConfigError);
  });

  it('rank_exit: top ve days zorunlu', () => {
    const config = validateAlertRuleConfig(AlertRuleType.RankExit, {
      top: 10,
      days: 3,
    });

    expect(config).toEqual({ top: 10, days: 3 });
  });

  it('rank_exit: days negatifse hata', () => {
    expect(() =>
      validateAlertRuleConfig(AlertRuleType.RankExit, { top: 10, days: -1 }),
    ).toThrow(InvalidAlertRuleConfigError);
  });

  it('traffic_drop: geçerli metric ve sayılar kabul edilir', () => {
    const config = validateAlertRuleConfig(AlertRuleType.TrafficDrop, {
      metric: 'sessions',
      pct: 25,
      window: 7,
    });

    expect(config).toEqual({ metric: 'sessions', pct: 25, window: 7 });
  });

  it("traffic_drop: geçersiz metric'te hata", () => {
    expect(() =>
      validateAlertRuleConfig(AlertRuleType.TrafficDrop, {
        metric: 'clicks-per-day',
        pct: 25,
        window: 7,
      }),
    ).toThrow(InvalidAlertRuleConfigError);
  });

  it('sync_failure: boş obje kabul edilir', () => {
    expect(validateAlertRuleConfig(AlertRuleType.SyncFailure, {})).toEqual({});
  });

  it('config obje değilse hata', () => {
    expect(() =>
      validateAlertRuleConfig(AlertRuleType.RankDrop, 'not-an-object'),
    ).toThrow(InvalidAlertRuleConfigError);
  });
});
