import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Project } from '../../clients/entities/project.entity';
import type { AlertRuleConfig } from '../alert-rule-config';

/** ARCHITECTURE §11: Faz 1'deki dört alert kural tipi. */
export enum AlertRuleType {
  RankDrop = 'rank_drop',
  RankExit = 'rank_exit',
  TrafficDrop = 'traffic_drop',
  SyncFailure = 'sync_failure',
}

/** Varsayılan cooldown (ARCHITECTURE §5.7). */
export const DEFAULT_COOLDOWN_HOURS = 24;

/**
 * Proje başına alert kuralı (ARCHITECTURE §5.7, §11). `config` kural tipine
 * göre şekli değişen jsonb (`alert-rule-config.ts`), `channels` bildirim
 * gönderilecek `notification_channels.id` listesi. Faz 2'de genel otomasyon
 * motoruna (trigger/condition/action) taşınacağı için sade tutulur.
 */
@Entity('alert_rules')
@Index('IDX_alert_rules_org_id_project_id', ['orgId', 'projectId'])
export class AlertRule extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column('text')
  name!: string;

  @Column({ type: 'enum', enum: AlertRuleType, enumName: 'alert_rule_type' })
  type!: AlertRuleType;

  @Column('jsonb', { default: {} })
  config!: AlertRuleConfig;

  /** `notification_channels.id` listesi. */
  @Column('jsonb', { default: [] })
  channels!: string[];

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('smallint', { default: DEFAULT_COOLDOWN_HOURS })
  cooldownHours!: number;
}
