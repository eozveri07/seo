import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class UserNotFoundError extends DomainException {
  constructor() {
    super('USER_NOT_FOUND', 'Kullanıcı bulunamadı.', HttpStatus.NOT_FOUND);
  }
}
