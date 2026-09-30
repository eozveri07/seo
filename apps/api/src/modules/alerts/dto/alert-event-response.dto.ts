import { AlertEvent } from '../entities/alert-event.entity';

export class AlertEventResponseDto {
  id!: string;
  projectId!: string;
  ruleId!: string;
  ruleName!: string | null;
  dedupeKey!: string;
  payload!: Record<string, unknown>;
  severity!: string;
  triggeredAt!: Date;
  notifiedAt!: Date | null;
  notifyError!: string | null;

  static fromEntity(
    event: AlertEvent,
    ruleName: string | null,
  ): AlertEventResponseDto {
    return {
      id: event.id,
      projectId: event.projectId,
      ruleId: event.ruleId,
      ruleName,
      dedupeKey: event.dedupeKey,
      payload: event.payload,
      severity: event.severity,
      triggeredAt: event.triggeredAt,
      notifiedAt: event.notifiedAt,
      notifyError: event.notifyError,
    };
  }
}

export class AlertEventListResponseDto {
  items!: AlertEventResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
