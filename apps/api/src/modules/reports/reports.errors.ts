import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ReportNotFoundError extends DomainException {
  constructor() {
    super('REPORT_NOT_FOUND', 'Rapor bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

export class ReportNotReadyError extends DomainException {
  constructor() {
    super('REPORT_NOT_READY', 'Rapor henüz hazır değil.', HttpStatus.CONFLICT);
  }
}

export class ReportScheduleNotFoundError extends DomainException {
  constructor() {
    super(
      'REPORT_SCHEDULE_NOT_FOUND',
      'Rapor zamanlaması bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidReportScheduleError extends DomainException {
  constructor(message: string) {
    super('INVALID_REPORT_SCHEDULE', message, HttpStatus.BAD_REQUEST);
  }
}

export class InvalidReportPeriodError extends DomainException {
  constructor(message: string) {
    super('INVALID_REPORT_PERIOD', message, HttpStatus.BAD_REQUEST);
  }
}

/** Report token yok, süresi dolmuş, imzası geçersiz ya da başka bir rapora ait. */
export class InvalidReportTokenError extends DomainException {
  constructor() {
    super(
      'INVALID_REPORT_TOKEN',
      "Rapor token'ı geçersiz ya da süresi dolmuş.",
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/** `REPORT_TOKEN_SECRET` ortam değişkeni tanımlı değil. */
export class ReportTokenSecretMissingError extends DomainException {
  constructor() {
    super(
      'REPORT_TOKEN_SECRET_MISSING',
      'REPORT_TOKEN_SECRET tanımlı değil.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/** PDF henüz üretilmemiş ya da storage'da bulunamadı. */
export class ReportFileNotFoundError extends DomainException {
  constructor() {
    super(
      'REPORT_FILE_NOT_FOUND',
      'Rapor dosyası bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}
