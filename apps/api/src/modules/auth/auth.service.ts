import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessTokenPayload } from '../../common/auth/auth-user';
import { EnvironmentVariables } from '../../config/environment-variables';
import { InvitationsService } from '../organizations/invitations.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RegistrationClosedError,
} from './auth.errors';
import { PasswordHasher } from './password-hasher.service';
import {
  ClientMeta,
  IssuedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service';

/** İlk kullanıcı kaydını seri hâle getiren advisory lock anahtarı. */
const FIRST_USER_LOCK_KEY = 1_101_001;

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface RegisterInvitedInput {
  token: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  /** Access token ömrü, saniye. */
  expiresIn: number;
  user: User;
  /** Sadece cookie'ye yazılır; response gövdesine konmaz. */
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invitationsService: InvitationsService,
  ) {}

  /**
   * Sadece hiç kullanıcı yokken ilk kullanıcıyı oluşturur. İki eşzamanlı
   * istek advisory lock ile sıraya girer; ikincisi kullanıcıyı görür ve reddedilir.
   */
  async register(input: RegisterInput, meta: ClientMeta): Promise<AuthSession> {
    if ((await this.usersService.count()) > 0) {
      throw new RegistrationClosedError();
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        FIRST_USER_LOCK_KEY,
      ]);
      if ((await this.usersService.count(manager)) > 0) {
        throw new RegistrationClosedError();
      }
      return this.usersService.create(
        { email: input.email, name: input.name, passwordHash },
        manager,
      );
    });

    return this.startSession(user, meta);
  }

  /**
   * Davetli kayıt: davetteki e-postayla hesap açılır, üyelik eklenir ve oturum
   * başlatılır. Davet tek kullanımlıktır; hesap zaten varsa reddedilir.
   */
  async registerInvited(
    input: RegisterInvitedInput,
    meta: ClientMeta,
  ): Promise<AuthSession> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const { user } = await this.invitationsService.acceptWithSignup({
      token: input.token,
      name: input.name,
      passwordHash,
    });
    return this.startSession(user, meta);
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthSession> {
    const user = await this.usersService.findByEmailWithPasswordHash(
      input.email,
    );
    if (!user) {
      await this.passwordHasher.verifyDummy(input.password);
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );
    if (!valid || !user.isActive) {
      throw new InvalidCredentialsError();
    }

    await this.usersService.markLoggedIn(user.id);
    return this.startSession(user, meta);
  }

  async refresh(
    refreshToken: string | undefined,
    meta: ClientMeta,
  ): Promise<AuthSession> {
    if (!refreshToken) {
      throw new InvalidRefreshTokenError();
    }

    const issued = await this.refreshTokens.rotate(refreshToken, meta);
    const user = await this.usersService.findById(issued.userId);
    if (!user || !user.isActive) {
      await this.refreshTokens.revokeFamily(issued.familyId);
      throw new InvalidRefreshTokenError();
    }

    return this.buildSession(user, issued);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.refreshTokens.revokeFamilyOf(refreshToken);
    }
  }

  private async startSession(
    user: User,
    meta: ClientMeta,
  ): Promise<AuthSession> {
    const issued = await this.refreshTokens.issue(user.id, meta);
    return this.buildSession(user, issued);
  }

  private async buildSession(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthSession> {
    const payload: AccessTokenPayload = { sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      expiresIn: this.configService.get('JWT_ACCESS_TTL', { infer: true }),
      user,
      refreshToken,
    };
  }
}
