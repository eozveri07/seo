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

/** Org kapsamlı endpoint'e X-Org-Id header'ı olmadan gelindi. */
export class OrgIdRequiredError extends DomainException {
  constructor() {
    super(
      'ORG_ID_REQUIRED',
      'X-Org-Id header’ı ile bir organizasyon seçilmeli.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Kullanıcı X-Org-Id'deki organizasyonun üyesi değil ya da organizasyon yok.
 * İki durum ayırt edilmez.
 */
export class OrgAccessDeniedError extends DomainException {
  constructor() {
    super(
      'ORG_ACCESS_DENIED',
      'Bu organizasyona erişiminiz yok.',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** Kullanıcının organizasyondaki rolü bu işlem için yetmiyor (§4.2). */
export class InsufficientRoleError extends DomainException {
  constructor() {
    super(
      'INSUFFICIENT_ROLE',
      'Bu işlem için yetkiniz yok.',
      HttpStatus.FORBIDDEN,
    );
  }
}
