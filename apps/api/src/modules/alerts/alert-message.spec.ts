import { buildAlertMessage } from './alert-message';
import { AlertRuleType } from './entities/alert-rule.entity';

describe('buildAlertMessage', () => {
  it('rank_drop: proje, keyword, eski/yeni pozisyon ve panel linkini içerir', () => {
    const message = buildAlertMessage({
      alertType: AlertRuleType.RankDrop,
      projectName: 'Acme',
      keyword: 'seo ajansı',
      previousPosition: 3,
      position: 8,
      panelUrl: 'https://panel.example.com/projects/p1/keywords',
    });

    expect(message.subject).toContain('seo ajansı');
    expect(message.text).toContain('Acme');
    expect(message.text).toContain('3 → 8');
    expect(message.text).toContain(
      'https://panel.example.com/projects/p1/keywords',
    );
  });

  it('rank_exit: top N ve gün sayısını içerir', () => {
    const message = buildAlertMessage({
      alertType: AlertRuleType.RankExit,
      projectName: 'Acme',
      keyword: 'seo ajansı',
      top: 10,
      days: 3,
      position: 15,
      panelUrl: 'https://panel.example.com',
    });

    expect(message.text).toContain('top 10');
    expect(message.text).toContain('3 gündür');
  });

  it('traffic_drop: yüzde ve önceki/şimdiki değerleri içerir', () => {
    const message = buildAlertMessage({
      alertType: AlertRuleType.TrafficDrop,
      projectName: 'Acme',
      metric: 'clicks',
      previous: 100,
      current: 60,
      pctChange: 40,
      panelUrl: 'https://panel.example.com',
    });

    expect(message.text).toContain('%40');
    expect(message.text).toContain('100 → 60');
  });

  it('sync_failure: nedeni içerir', () => {
    const message = buildAlertMessage({
      alertType: AlertRuleType.SyncFailure,
      projectName: 'Acme',
      reason: 'GSC 403',
      panelUrl: 'https://panel.example.com',
    });

    expect(message.text).toContain('GSC 403');
  });

  it('bilinmeyen alertType için genel bir mesaj döner', () => {
    const message = buildAlertMessage({
      projectName: 'Acme',
      panelUrl: 'https://p',
    });

    expect(message.subject).toContain('Acme');
  });
});
