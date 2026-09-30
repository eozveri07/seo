import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { AlertRule } from './alert-rule.entity';

/**
 * Tetiklenen bir alert (ARCHITECTURE §5.7, §11). `(rule_id, dedupe_key)`
 * unique'tir; `alert-events.store.ts`'teki `ON CONFLICT ... DO UPDATE ...
 * WHERE` ile hem dedupe hem `cooldown_hours` uygulanır. `payload` bildirim
 * mesajının ihtiyaç duyduğu her şeyi (proje adı, keyword, eski/yeni pozisyon
 * gibi) taşır; `notify` job'u ek sorgu yapmaz.
 */
@Entity('alert_events')
@Index('IDX_alert_events_org_id_project_id_triggered_at', [
  'orgId',
  'projectId',
  'triggeredAt',
])
export class AlertEvent extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @Column('uuid')
  ruleId!: string;

  @ManyToOne(() => AlertRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule?: AlertRule;

  @Column('text')
  dedupeKey!: string;

  @Column('jsonb', { default: {} })
  payload!: Record<string, unknown>;

  @Column('text', { default: 'warning' })
  severity!: string;

  @Column('timestamptz', { default: () => 'now()' })
  triggeredAt!: Date;

  @Column('timestamptz', { nullable: true })
  notifiedAt!: Date | null;

  @Column('text', { nullable: true })
  notifyError!: string | null;
}
