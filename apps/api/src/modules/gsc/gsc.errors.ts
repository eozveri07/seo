import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

/** Manuel sync için projenin aktif (doğrulanmış) GSC bağlantısı olmalı. */
export class GscConnectionNotActiveError extends DomainException {
  constructor() {
    super(
      'GSC_CONNECTION_NOT_ACTIVE',
      'Bu projenin aktif bir Search Console bağlantısı yok.',
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidDateRangeError extends DomainException {
  constructor(message: string) {
    super('INVALID_DATE_RANGE', message, HttpStatus.BAD_REQUEST);
  }
}
