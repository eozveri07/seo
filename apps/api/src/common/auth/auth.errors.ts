import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../exceptions/domain.exception';

/** Access token yok, süresi dolmuş ya da imzası geçersiz. */
export class InvalidAccessTokenError extends DomainException {
  constructor() {
    super(
      'UNAUTHORIZED',
      'Oturum geçersiz ya da süresi dolmuş.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
