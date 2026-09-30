import { ApiProperty } from '@nestjs/swagger';
import { AlertRuleConfig } from '../alert-rule-config';
import { AlertRule, AlertRuleType } from '../entities/alert-rule.entity';

export class AlertRuleResponseDto {
  id!: string;
  projectId!: string;
  name!: string;

  @ApiProperty({ enum: AlertRuleType, enumName: 'AlertRuleType' })
  type!: AlertRuleType;

  config!: AlertRuleConfig;
  channels!: string[];
  isActive!: boolean;
  cooldownHours!: number;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(rule: AlertRule): AlertRuleResponseDto {
    return {
      id: rule.id,
      projectId: rule.projectId,
      name: rule.name,
      type: rule.type,
      config: rule.config,
      channels: rule.channels,
      isActive: rule.isActive,
      cooldownHours: rule.cooldownHours,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}

export class AlertRuleListResponseDto {
  items!: AlertRuleResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
