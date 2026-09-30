import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class InvalidRankDateRangeError extends DomainException {
  constructor(message: string) {
    super('INVALID_DATE_RANGE', message, HttpStatus.BAD_REQUEST);
  }
}

/** `rankings/serp/:keywordId`: keyword için (o gün) sonuç yok. */
export class RankResultNotFoundError extends DomainException {
  constructor() {
    super(
      'RANK_RESULT_NOT_FOUND',
      'Bu keyword için rank sonucu bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}
