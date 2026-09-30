import { AlertRuleType } from '@/api/endpoints.schemas'

export const ALERT_RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  [AlertRuleType.rank_drop]: 'Pozisyon düşüşü',
  [AlertRuleType.rank_exit]: "Top N'den çıkış",
  [AlertRuleType.traffic_drop]: 'Trafik düşüşü',
  [AlertRuleType.sync_failure]: 'Senkronizasyon hatası',
}
