import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../exceptions/domain.exception';

/** Tenant verisine CLS'te orgId yokken erişilmeye çalışıldı: programlama hatası. */
export class TenantContextMissingError extends DomainException {
  constructor() {
    super(
      'TENANT_CONTEXT_MISSING',
      'Beklenmeyen bir hata oluştu.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/** Yazılan veri CLS'teki organizasyondan başka bir organizasyona ait. */
export class TenantMismatchError extends DomainException {
  constructor() {
    super(
      'TENANT_MISMATCH',
      'Beklenmeyen bir hata oluştu.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
