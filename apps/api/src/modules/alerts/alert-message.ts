import { AlertMessage } from './channel-sender.service';
import { AlertRuleType } from './entities/alert-rule.entity';

/** `payload` jsonb'den geldiği için `unknown`; primitive olmayan değerler `fallback`'e düşer. */
function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

/**
 * Alert payload'undan kısa ve eyleme dönük bir bildirim mesajı üretir
 * (ARCHITECTURE §11 görev metni): proje, keyword, eski/yeni pozisyon ve
 * panel linki. `AlertEvalService` payload'a `alertType` (kural tipi) ekler;
 * bu sayede `notify` iş mantığı ek sorgu yapmadan doğru şablonu seçer.
 */
export function buildAlertMessage(
  payload: Record<string, unknown>,
): AlertMessage {
  const panelUrl = str(payload.panelUrl);
  const projectName = str(payload.projectName, 'Proje');

  switch (payload.alertType) {
    case AlertRuleType.RankDrop: {
      const keyword = str(payload.keyword);
      const previous = str(payload.previousPosition, '?');
      const current = str(payload.position, '?');
      return {
        subject: `Rank düşüşü: ${keyword}`,
        text: `${projectName}: "${keyword}" pozisyonu ${previous} → ${current} oldu.\n${panelUrl}`,
        html: `<p><strong>${projectName}</strong>: "${keyword}" pozisyonu ${previous} → ${current} oldu.</p><p><a href="${panelUrl}">Panelde gör</a></p>`,
      };
    }
    case AlertRuleType.RankExit: {
      const keyword = str(payload.keyword);
      const days = str(payload.days, '?');
      const top = str(payload.top, '?');
      const position = str(payload.position, '?');
      return {
        subject: `Top ${top} dışında: ${keyword}`,
        text: `${projectName}: "${keyword}" ${days} gündür top ${top} dışında (şu an ${position}).\n${panelUrl}`,
        html: `<p><strong>${projectName}</strong>: "${keyword}" ${days} gündür top ${top} dışında (şu an ${position}).</p><p><a href="${panelUrl}">Panelde gör</a></p>`,
      };
    }
    case AlertRuleType.TrafficDrop: {
      const metric = payload.metric === 'sessions' ? 'oturum' : 'tıklama';
      const pct = Math.round(Number(payload.pctChange ?? 0));
      const previous = str(payload.previous, '?');
      const current = str(payload.current, '?');
      return {
        subject: `Trafik düşüşü: ${projectName}`,
        text: `${projectName}: son dönemde ${metric} sayısı %${pct} düştü (${previous} → ${current}).\n${panelUrl}`,
        html: `<p><strong>${projectName}</strong>: son dönemde ${metric} sayısı %${pct} düştü (${previous} → ${current}).</p><p><a href="${panelUrl}">Panelde gör</a></p>`,
      };
    }
    case AlertRuleType.SyncFailure: {
      const reason = str(payload.reason, 'Senkronizasyon başarısız oldu.');
      return {
        subject: `Senkronizasyon hatası: ${projectName}`,
        text: `${projectName}: ${reason}\n${panelUrl}`,
        html: `<p><strong>${projectName}</strong>: ${reason}</p><p><a href="${panelUrl}">Panelde gör</a></p>`,
      };
    }
    default:
      return {
        subject: `Alert: ${projectName}`,
        text: `${projectName} için bir alert tetiklendi.\n${panelUrl}`,
        html: `<p><strong>${projectName}</strong> için bir alert tetiklendi.</p><p><a href="${panelUrl}">Panelde gör</a></p>`,
      };
  }
}
