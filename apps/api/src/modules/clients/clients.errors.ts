import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ClientNotFoundError extends DomainException {
  constructor() {
    super('CLIENT_NOT_FOUND', 'Client bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

export class ProjectNotFoundError extends DomainException {
  constructor() {
    super('PROJECT_NOT_FOUND', 'Proje bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

/** Verilen `clientId` bu org'a ait değil ya da yok. */
export class InvalidProjectClientError extends DomainException {
  constructor() {
    super(
      'INVALID_PROJECT_CLIENT',
      'Belirtilen client bu organizasyonda bulunamadı.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ProjectDomainTakenError extends DomainException {
  constructor() {
    super(
      'PROJECT_DOMAIN_TAKEN',
      'Bu domain bu organizasyonda başka bir projede kullanılıyor.',
      HttpStatus.CONFLICT,
    );
  }
}
