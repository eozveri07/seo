import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RegistrationClosedError,
} from './auth.errors';
import { InvitationsService } from '../organizations/invitations.service';
import { AuthService } from './auth.service';
import {
  IssuedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service';

const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const META = { userAgent: 'jest', ip: '127.0.0.1' };

function user(overrides: Partial<User> = {}): User {
  return {
    id: '0190f0e4-0000-7000-8000-0000000000a1',
    email: 'owner@example.com',
    name: 'Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function issued(
  overrides: Partial<IssuedRefreshToken> = {},
): IssuedRefreshToken {
  return {
    token: 'opaque-refresh-token',
    userId: user().id,
    familyId: 'family-1',
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    ...overrides,
  };
}

function setup() {
  const usersService = {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((input: { email: string; name: string }) =>
      Promise.resolve(user({ email: input.email, name: input.name })),
    ),
    findById: jest.fn().mockResolvedValue(user()),
    findByEmailWithPasswordHash: jest.fn().mockResolvedValue(null),
    markLoggedIn: jest.fn().mockResolvedValue(undefined),
  };
  const passwordHasher = {
    hash: jest.fn().mockResolvedValue('$argon2id$hash'),
    verify: jest.fn().mockResolvedValue(false),
    verifyDummy: jest.fn().mockResolvedValue(undefined),
  };
  const refreshTokens = {
    issue: jest.fn().mockResolvedValue(issued()),
    rotate: jest.fn().mockResolvedValue(issued({ token: 'rotated-token' })),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    revokeFamilyOf: jest.fn().mockResolvedValue(undefined),
  };
  const manager = { query: jest.fn().mockResolvedValue([]) };
  const dataSource = {
    transaction: jest.fn(
      <T>(cb: (m: EntityManager) => Promise<T>): Promise<T> =>
        cb(manager as unknown as EntityManager),
    ),
  };
  const invitationsService = {
    acceptWithSignup: jest.fn((input: { passwordHash: string }) =>
      Promise.resolve({
        user: user({ email: 'davetli@example.com', name: 'Davetli' }),
        membership: { passwordHash: input.passwordHash },
      }),
    ),
  };
  const jwtService = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', expiresIn: 900 },
  });
  const config = {
    get: jest.fn((key: string) => (key === 'JWT_ACCESS_TTL' ? 900 : undefined)),
  };
  const service = new AuthService(
    usersService as unknown as UsersService,
    passwordHasher,
    refreshTokens as unknown as RefreshTokenService,
    jwtService,
    config as unknown as ConfigService<EnvironmentVariables, true>,
    dataSource as unknown as DataSource,
    invitationsService as unknown as InvitationsService,
  );
  return {
    service,
    usersService,
    passwordHasher,
    refreshTokens,
    manager,
    jwtService,
    invitationsService,
  };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('hata bekleniyordu');
}

describe('AuthService', () => {
  describe('registerInvited', () => {
    it('şifreyi hash’leyip davetli kaydı başlatır ve oturum açar', async () => {
      const { service, invitationsService, refreshTokens, passwordHasher } =
        setup();

      const session = await service.registerInvited(
        { token: 'davet-token', name: 'Davetli', password: 'cok-gizli-sifre' },
        META,
      );

      expect(passwordHasher.hash).toHaveBeenCalledWith('cok-gizli-sifre');
      expect(invitationsService.acceptWithSignup).toHaveBeenCalledWith({
        token: 'davet-token',
        name: 'Davetli',
        passwordHash: '$argon2id$hash',
      });
      expect(refreshTokens.issue).toHaveBeenCalledWith(user().id, META);
      expect(session.user.email).toBe('davetli@example.com');
      expect(session.accessToken).toBeTruthy();
    });

    it('davet reddedilirse oturum açılmaz', async () => {
      const { service, invitationsService, refreshTokens } = setup();
      invitationsService.acceptWithSignup.mockRejectedValueOnce(
        new Error('INVITATION_EXPIRED'),
      );

      await expect(
        service.registerInvited(
          { token: 'eski', name: 'Davetli', password: 'cok-gizli-sifre' },
          META,
        ),
      ).rejects.toThrow('INVITATION_EXPIRED');
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('bilinmeyen e-postada dummy hash doğrular ve INVALID_CREDENTIALS döner', async () => {
      const { service, passwordHasher, refreshTokens } = setup();

      const error = await captureError(
        service.login({ email: 'yok@example.com', password: 'x' }, META),
      );

      expect(error).toBeInstanceOf(InvalidCredentialsError);
      expect(passwordHasher.verifyDummy).toHaveBeenCalledWith('x');
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });

    it('yanlış şifre ile bilinmeyen e-posta aynı kod, mesaj ve durumu döner', async () => {
      const unknown = setup();
      const wrong = setup();
      wrong.usersService.findByEmailWithPasswordHash.mockResolvedValue({
        ...user(),
        passwordHash: '$argon2id$hash',
      });

      const unknownError = (await captureError(
        unknown.service.login(
          { email: 'yok@example.com', password: 'x' },
          META,
        ),
      )) as InvalidCredentialsError;
      const wrongError = (await captureError(
        wrong.service.login(
          { email: 'owner@example.com', password: 'x' },
          META,
        ),
      )) as InvalidCredentialsError;

      expect(wrongError).toBeInstanceOf(InvalidCredentialsError);
      expect(wrongError.code).toBe('INVALID_CREDENTIALS');
      expect([wrongError.code, wrongError.message, wrongError.status]).toEqual([
        unknownError.code,
        unknownError.message,
        unknownError.status,
      ]);
      expect(wrong.passwordHasher.verify).toHaveBeenCalledWith(
        '$argon2id$hash',
        'x',
      );
    });

    it('pasif kullanıcı doğru şifreyle de INVALID_CREDENTIALS alır', async () => {
      const { service, usersService, passwordHasher } = setup();
      usersService.findByEmailWithPasswordHash.mockResolvedValue({
        ...user({ isActive: false }),
        passwordHash: '$argon2id$hash',
      });
      passwordHasher.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'owner@example.com', password: 'dogru' }, META),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('doğru şifrede 15 dakikalık access token ve yeni refresh ailesi döner', async () => {
      const {
        service,
        usersService,
        passwordHasher,
        refreshTokens,
        jwtService,
      } = setup();
      usersService.findByEmailWithPasswordHash.mockResolvedValue({
        ...user(),
        passwordHash: '$argon2id$hash',
      });
      passwordHasher.verify.mockResolvedValue(true);

      const session = await service.login(
        { email: 'Owner@Example.com', password: 'dogru' },
        META,
      );

      const payload = await jwtService.verifyAsync<{
        sub: string;
        iat: number;
        exp: number;
      }>(session.accessToken);
      expect(payload.sub).toBe(user().id);
      expect(payload.exp - payload.iat).toBe(15 * 60);
      expect(session.expiresIn).toBe(900);
      expect(refreshTokens.issue).toHaveBeenCalledWith(user().id, META);
      expect(usersService.markLoggedIn).toHaveBeenCalledWith(user().id);
    });
  });

  describe('register', () => {
    it('kullanıcı varsa REGISTRATION_CLOSED döner ve hash üretmez', async () => {
      const { service, usersService, passwordHasher } = setup();
      usersService.count.mockResolvedValue(1);

      await expect(
        service.register(
          { email: 'a@example.com', name: 'A', password: 'uzun-sifre' },
          META,
        ),
      ).rejects.toBeInstanceOf(RegistrationClosedError);
      expect(passwordHasher.hash).not.toHaveBeenCalled();
    });

    it('lock alındıktan sonra kullanıcı oluşmuşsa (yarış) reddeder', async () => {
      const { service, usersService } = setup();
      usersService.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      await expect(
        service.register(
          { email: 'a@example.com', name: 'A', password: 'uzun-sifre' },
          META,
        ),
      ).rejects.toBeInstanceOf(RegistrationClosedError);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('ilk kullanıcıyı advisory lock altında argon2 hash ile oluşturur ve oturum açar', async () => {
      const { service, usersService, passwordHasher, refreshTokens, manager } =
        setup();

      const session = await service.register(
        { email: 'a@example.com', name: 'A', password: 'uzun-sifre' },
        META,
      );

      expect(passwordHasher.hash).toHaveBeenCalledWith('uzun-sifre');
      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock($1)',
        expect.any(Array),
      );
      expect(usersService.create).toHaveBeenCalledWith(
        { email: 'a@example.com', name: 'A', passwordHash: '$argon2id$hash' },
        manager,
      );
      expect(refreshTokens.issue).toHaveBeenCalled();
      expect(session.accessToken).toBeTruthy();
    });
  });

  describe('refresh', () => {
    it('cookie yoksa INVALID_REFRESH_TOKEN', async () => {
      const { service, refreshTokens } = setup();

      await expect(service.refresh(undefined, META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it('rotation sonrası yeni access token ve yeni refresh token döner', async () => {
      const { service, refreshTokens } = setup();

      const session = await service.refresh('opaque-refresh-token', META);

      expect(refreshTokens.rotate).toHaveBeenCalledWith(
        'opaque-refresh-token',
        META,
      );
      expect(session.refreshToken.token).toBe('rotated-token');
      expect(session.accessToken).toBeTruthy();
    });

    it('kullanıcı pasifse aileyi iptal eder ve reddeder', async () => {
      const { service, usersService, refreshTokens } = setup();
      usersService.findById.mockResolvedValue(user({ isActive: false }));

      await expect(
        service.refresh('opaque-refresh-token', META),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(refreshTokens.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('rotation hatası (tekrar kullanım) aynen iletilir', async () => {
      const { service, refreshTokens } = setup();
      refreshTokens.rotate.mockRejectedValue(new InvalidRefreshTokenError());

      await expect(service.refresh('eski', META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });
  });

  describe('logout', () => {
    it('token’ın ailesini iptal eder', async () => {
      const { service, refreshTokens } = setup();

      await service.logout('opaque-refresh-token');

      expect(refreshTokens.revokeFamilyOf).toHaveBeenCalledWith(
        'opaque-refresh-token',
      );
    });

    it('cookie yoksa sessizce biter', async () => {
      const { service, refreshTokens } = setup();

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(refreshTokens.revokeFamilyOf).not.toHaveBeenCalled();
    });
  });
});
