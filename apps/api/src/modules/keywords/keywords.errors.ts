import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class KeywordGroupNotFoundError extends DomainException {
  constructor() {
    super(
      'KEYWORD_GROUP_NOT_FOUND',
      'Keyword grubu bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class KeywordGroupNameTakenError extends DomainException {
  constructor() {
    super(
      'KEYWORD_GROUP_NAME_TAKEN',
      'Bu isimde bir keyword grubu zaten var.',
      HttpStatus.CONFLICT,
    );
  }
}

export class TrackedKeywordNotFoundError extends DomainException {
  constructor() {
    super(
      'TRACKED_KEYWORD_NOT_FOUND',
      'Keyword bulunamadı.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TrackedKeywordAlreadyExistsError extends DomainException {
  constructor() {
    super(
      'TRACKED_KEYWORD_ALREADY_EXISTS',
      'Bu keyword (cihaz, lokasyon ve dille) zaten takip ediliyor.',
      HttpStatus.CONFLICT,
    );
  }
}

/** Bulk ekleme istek satır limitini aşarsa. */
export class TooManyKeywordsError extends DomainException {
  constructor(limit: number) {
    super(
      'TOO_MANY_KEYWORDS',
      `Bir istekte en fazla ${limit} satır gönderilebilir.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
