import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class AlertRuleNotFoundError extends DomainException {
  constructor() {
    super(
      'ALERT_RULE_NOT_FOUND',
      'Alert kuralı bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidAlertRuleConfigError extends DomainException {
  constructor(message: string) {
    super('INVALID_ALERT_RULE_CONFIG', message, HttpStatus.BAD_REQUEST);
  }
}

export class UnknownNotificationChannelError extends DomainException {
  constructor() {
    super(
      'UNKNOWN_NOTIFICATION_CHANNEL',
      'Kuralda seçilen bir bildirim kanalı bulunamadı.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class NotificationChannelNotFoundError extends DomainException {
  constructor() {
    super(
      'NOTIFICATION_CHANNEL_NOT_FOUND',
      'Bildirim kanalı bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/** `notify` job'u `alertEventId` olmadan eklenmişse (T1.15 rapor bildirimleri henüz yok). */
export class MissingAlertEventIdError extends DomainException {
  constructor() {
    super(
      'MISSING_ALERT_EVENT_ID',
      "notify job'u alertEventId olmadan eklendi.",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class NotificationChannelTestFailedError extends DomainException {
  constructor(reason: string) {
    super(
      'NOTIFICATION_CHANNEL_TEST_FAILED',
      `Test bildirimi gönderilemedi: ${reason}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}
