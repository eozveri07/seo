import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { EnvironmentVariables } from '../../config/environment-variables';
import { REFRESH_THROTTLE, LOGIN_THROTTLE } from './auth-throttle';
import { AuthService, AuthSession } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';
import { ClientMeta } from './refresh-token.service';

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'İstek limiti aşıldı.' })
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Sadece hiç kullanıcı yokken ilk kullanıcıyı oluşturur ve oturum açar. */
  @Post('register')
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiForbiddenResponse({ description: 'REGISTRATION_CLOSED' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.authService.register(dto, clientMeta(req));
    return this.respondWithSession(res, session);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.authService.login(dto, clientMeta(req));
    return this.respondWithSession(res, session);
  }

  /** Refresh token cookie'den okunur, rotation uygulanır ve yeni cookie yazılır. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(REFRESH_THROTTLE)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_REFRESH_TOKEN' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      const session = await this.authService.refresh(
        readRefreshCookie(req),
        clientMeta(req),
      );
      return this.respondWithSession(res, session);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
      throw error;
    }
  }

  /** Refresh token ailesini iptal eder ve cookie'yi siler. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private respondWithSession(
    res: Response,
    session: AuthSession,
  ): AuthResponseDto {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken.token, {
      ...this.cookieOptions(),
      expires: session.refreshToken.expiresAt,
    });
    return AuthResponseDto.fromSession(session);
  }

  private cookieOptions(): ReturnType<typeof refreshCookieOptions> {
    return refreshCookieOptions(
      this.configService.get('NODE_ENV', { infer: true }),
      this.configService.get('API_PREFIX', { infer: true }),
    );
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value ? value : undefined;
}

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}
