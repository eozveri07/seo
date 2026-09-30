import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class OrganizationSlugTakenError extends DomainException {
  constructor() {
    super(
      'ORG_SLUG_TAKEN',
      'Bu kısa ad başka bir organizasyonda kullanılıyor.',
      HttpStatus.CONFLICT,
    );
  }
}

export class MemberNotFoundError extends DomainException {
  constructor() {
    super('MEMBER_NOT_FOUND', 'Üye bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

/** Organizasyonun son owner'ı çıkarılamaz ve rolü düşürülemez. */
export class LastOwnerError extends DomainException {
  constructor() {
    super(
      'LAST_OWNER',
      'Organizasyonun son owner’ı çıkarılamaz ya da rolü düşürülemez.',
      HttpStatus.CONFLICT,
    );
  }
}

/** client_viewer'da client_id zorunlu, diğer rollerde verilemez. */
export class InvalidClientScopeError extends DomainException {
  constructor() {
    super(
      'INVALID_CLIENT_SCOPE',
      'client_viewer rolü için clientId zorunludur; diğer rollerde verilemez.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** owner rolünü yalnız owner verebilir, alabilir ya da davet edebilir. */
export class OwnerRoleRequiredError extends DomainException {
  constructor() {
    super(
      'OWNER_ROLE_REQUIRED',
      'owner rolüyle ilgili işlemleri yalnız owner yapabilir.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class AlreadyMemberError extends DomainException {
  constructor() {
    super(
      'ALREADY_MEMBER',
      'Kullanıcı zaten bu organizasyonun üyesi.',
      HttpStatus.CONFLICT,
    );
  }
}

export class InvitationNotFoundError extends DomainException {
  constructor() {
    super('INVITATION_NOT_FOUND', 'Davet bulunamadı.', HttpStatus.NOT_FOUND);
  }
}

export class InvitationExpiredError extends DomainException {
  constructor() {
    super('INVITATION_EXPIRED', 'Davetin süresi dolmuş.', HttpStatus.GONE);
  }
}

export class InvitationAlreadyAcceptedError extends DomainException {
  constructor() {
    super(
      'INVITATION_ALREADY_ACCEPTED',
      'Bu davet daha önce kabul edilmiş.',
      HttpStatus.CONFLICT,
    );
  }
}

/** Oturumdaki kullanıcının e-postası davetinkiyle aynı değil. */
export class InvitationEmailMismatchError extends DomainException {
  constructor() {
    super(
      'INVITATION_EMAIL_MISMATCH',
      'Bu davet başka bir e-posta adresine gönderilmiş.',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** Davetli e-postayla hesap zaten var: yeni hesap açılmaz, giriş yapıp kabul edilir. */
export class InvitationAccountExistsError extends DomainException {
  constructor() {
    super(
      'INVITATION_ACCOUNT_EXISTS',
      'Bu e-postayla bir hesap var. Giriş yapıp daveti kabul edin.',
      HttpStatus.CONFLICT,
    );
  }
}
