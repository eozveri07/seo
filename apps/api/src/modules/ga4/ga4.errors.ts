import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

/** Manuel sync için projenin aktif (doğrulanmış) GA4 bağlantısı olmalı. */
export class Ga4ConnectionNotActiveError extends DomainException {
  constructor() {
    super(
      'GA4_CONNECTION_NOT_ACTIVE',
      'Bu projenin aktif bir GA4 bağlantısı yok.',
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidGa4DateRangeError extends DomainException {
  constructor(message: string) {
    super('INVALID_DATE_RANGE', message, HttpStatus.BAD_REQUEST);
  }
}
