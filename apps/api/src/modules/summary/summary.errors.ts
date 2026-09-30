import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class InvalidSummaryDateRangeError extends DomainException {
  constructor(message: string) {
    super('INVALID_DATE_RANGE', message, HttpStatus.BAD_REQUEST);
  }
}
