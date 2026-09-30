import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from './auth-user';
import { InvalidAccessTokenError } from './auth.errors';

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** JwtAuthGuard'ın doğruladığı kullanıcı. `@Public()` handler'larda kullanılmaz. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new InvalidAccessTokenError();
    }
    return request.user;
  },
);
