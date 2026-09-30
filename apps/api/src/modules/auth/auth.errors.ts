import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

/**
 * Yanlış şifre, bilinmeyen e-posta ve pasif kullanıcı için tek genel hata;
 * kullanıcının var olup olmadığı belli olmaz.
 */
export class InvalidCredentialsError extends DomainException {
  constructor() {
    super(
      'INVALID_CREDENTIALS',
      'E-posta ya da şifre hatalı.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Refresh token yok, bilinmiyor, süresi dolmuş, iptal edilmiş ya da daha önce
 * kullanılmış. Tekrar kullanım ayrı bir kodla belli edilmez; sadece loglanır.
 */
export class InvalidRefreshTokenError extends DomainException {
  constructor() {
    super(
      'INVALID_REFRESH_TOKEN',
      'Oturum yenilenemedi, tekrar giriş yapın.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/** İlk kullanıcı oluşturulduktan sonra açık kayıt kapanır; kayıt davetle olur. */
export class RegistrationClosedError extends DomainException {
  constructor() {
    super(
      'REGISTRATION_CLOSED',
      'Kayıt kapalı. Bir organizasyona davetle katılabilirsiniz.',
      HttpStatus.FORBIDDEN,
    );
  }
}
