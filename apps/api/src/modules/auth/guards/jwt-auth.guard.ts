import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import { AccessTokenPayload } from '../../../common/auth/auth-user';
import { InvalidAccessTokenError } from '../../../common/auth/auth.errors';
import type { AuthenticatedRequest } from '../../../common/auth/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator';
import { AppClsStore } from '../../../common/cls-store';

/**
 * Global guard (ARCHITECTURE §4.3): `Authorization: Bearer` access token'ı
 * doğrular, kullanıcıyı request'e ve CLS'e yazar. `@Public()` ile işaretli
 * handler ve controller'lar atlanır.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new InvalidAccessTokenError();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new InvalidAccessTokenError();
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new InvalidAccessTokenError();
    }

    request.user = { id: payload.sub };
    if (this.cls.isActive()) {
      this.cls.set('userId', payload.sub);
    }
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
