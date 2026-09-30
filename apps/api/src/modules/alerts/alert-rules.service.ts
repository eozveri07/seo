import { Injectable } from '@nestjs/common';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { validateAlertRuleConfig } from './alert-rule-config';
import {
  AlertRuleNotFoundError,
  UnknownNotificationChannelError,
} from './alerts.errors';
import {
  AlertRule,
  AlertRuleType,
  DEFAULT_COOLDOWN_HOURS,
} from './entities/alert-rule.entity';
import { ListAlertRuleQueryDto } from './dto/list-alert-rule-query.dto';
import { NotificationChannelsService } from './notification-channels.service';

export interface CreateAlertRuleInput {
  projectId: string;
  name: string;
  type: AlertRuleType;
  config: Record<string, unknown>;
  channels: string[];
  isActive?: boolean;
  cooldownHours?: number;
}

export interface UpdateAlertRuleInput {
  name?: string;
  config?: Record<string, unknown>;
  channels?: string[];
  isActive?: boolean;
  cooldownHours?: number;
}

/** Proje başına alert kuralı CRUD'u (ARCHITECTURE §5.7, §11). */
@Injectable()
export class AlertRulesService {
  constructor(
    @InjectTenantRepository(AlertRule)
    private readonly rules: TenantRepository<AlertRule>,
    private readonly notificationChannels: NotificationChannelsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: ListAlertRuleQueryDto,
  ): Promise<Page<AlertRule>> {
    const qb = this.rules
      .createQueryBuilder('rule')
      .andWhere('rule.project_id = :projectId', { projectId })
      .orderBy('rule.name', 'ASC')
      .addOrderBy('rule.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.type) {
      qb.andWhere('rule.type = :type', { type: query.type });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(projectId: string, id: string): Promise<AlertRule> {
    const rule = await this.rules.findOneBy({ id, projectId });
    if (!rule) {
      throw new AlertRuleNotFoundError();
    }
    return rule;
  }

  /** Aktif kurallar (evaluator için); `AlertEvalService` kullanır. */
  async listActive(projectId: string): Promise<AlertRule[]> {
    return this.rules.findBy({ projectId, isActive: true });
  }

  async create(input: CreateAlertRuleInput): Promise<AlertRule> {
    const config = validateAlertRuleConfig(input.type, input.config);
    await this.assertChannelsExist(input.channels);
    const rule = await this.rules.save({
      projectId: input.projectId,
      name: input.name.trim(),
      type: input.type,
      config,
      channels: input.channels,
      isActive: input.isActive ?? true,
      cooldownHours: input.cooldownHours ?? DEFAULT_COOLDOWN_HOURS,
    });
    await this.audit.record({
      action: AuditAction.AlertRuleCreated,
      entityType: 'alert_rule',
      entityId: rule.id,
      changes: { projectId: rule.projectId, type: rule.type, name: rule.name },
    });
    return rule;
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateAlertRuleInput,
  ): Promise<AlertRule> {
    const rule = await this.findOne(projectId, id);
    const patch: Partial<AlertRule> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.config !== undefined) {
      patch.config = validateAlertRuleConfig(rule.type, input.config);
    }
    if (input.channels !== undefined) {
      await this.assertChannelsExist(input.channels);
      patch.channels = input.channels;
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.cooldownHours !== undefined) {
      patch.cooldownHours = input.cooldownHours;
    }
    if (Object.keys(patch).length === 0) {
      return rule;
    }
    await this.rules.save({ ...rule, ...patch });
    await this.audit.record({
      action: AuditAction.AlertRuleUpdated,
      entityType: 'alert_rule',
      entityId: rule.id,
      changes: patch,
    });
    return Object.assign(rule, patch);
  }

  async delete(projectId: string, id: string): Promise<void> {
    const rule = await this.findOne(projectId, id);
    await this.rules.delete({ id: rule.id });
    await this.audit.record({
      action: AuditAction.AlertRuleDeleted,
      entityType: 'alert_rule',
      entityId: rule.id,
      changes: { projectId, name: rule.name },
    });
  }

  private async assertChannelsExist(channelIds: string[]): Promise<void> {
    for (const channelId of channelIds) {
      try {
        await this.notificationChannels.findOne(channelId);
      } catch {
        throw new UnknownNotificationChannelError();
      }
    }
  }
}
