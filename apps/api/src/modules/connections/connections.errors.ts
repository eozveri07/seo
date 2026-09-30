import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ConnectionNotFoundError extends DomainException {
  constructor() {
    super('CONNECTION_NOT_FOUND', 'Bağlantı bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

/** `(project_id, type)` için zaten bir bağlantı var. */
export class ConnectionTypeTakenError extends DomainException {
  constructor() {
    super(
      'CONNECTION_TYPE_TAKEN',
      'Bu proje için bu tipte zaten bir bağlantı var.',
      HttpStatus.CONFLICT,
    );
  }
}
