import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { EnvironmentVariables } from '../../config/environment-variables';
import { InvalidRefreshTokenError } from './auth.errors';
import { RefreshToken } from './refresh-token.entity';

const TOKEN_BYTES = 32;
const USER_AGENT_MAX_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClientMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedRefreshToken {
  /** Cookie'ye yazılacak opak değer. DB'de sadece hash'i durur. */
  token: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

/** Koşullu update hiçbir satırı değiştirmedi: token başka bir istekte kullanıldı. */
class RotationConflict extends Error {}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh token rotation ve tekrar kullanım tespiti (ARCHITECTURE §4.4).
 *
 * - Her `rotate` çağrısında yeni token üretilir, eskisi `replacedById` ile
 *   işaretlenir.
 * - İptal edilmiş ya da daha önce kullanılmış bir token gelirse ailenin
 *   tamamı iptal edilir.
 * - Eşzamanlı iki rotation'dan yalnızca biri kazanır: eski token'ı işaretleyen
 *   update `replaced_by_id IS NULL AND revoked_at IS NULL` şartıyla yapılır;
 *   Postgres satır kilidi yüzünden ikinci update 0 satır etkiler ve bu da
 *   tekrar kullanım sayılır.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Login ya da register'da yeni bir aile başlatır. */
  async issue(userId: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
    const { issued } = await this.insertToken(
      this.tokens.manager,
      userId,
      uuidv7(),
      meta,
    );
    return issued;
  }

  async rotate(token: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
    const current = await this.findByToken(token);
    if (!current) {
      throw new InvalidRefreshTokenError();
    }

    if (current.revokedAt || current.replacedById) {
      await this.revokeReusedFamily(current);
      throw new InvalidRefreshTokenError();
    }

    if (current.expiresAt.getTime() <= Date.now()) {
      throw new InvalidRefreshTokenError();
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const next = await this.insertToken(
          manager,
          current.userId,
          current.familyId,
          meta,
        );
        const result = await manager
          .getRepository(RefreshToken)
          .update(
            { id: current.id, replacedById: IsNull(), revokedAt: IsNull() },
            { replacedById: next.id },
          );
        if (!result.affected) {
          throw new RotationConflict();
        }
        return next.issued;
      });
    } catch (error) {
      if (error instanceof RotationConflict) {
        await this.revokeReusedFamily(current);
        throw new InvalidRefreshTokenError();
      }
      throw error;
    }
  }

  /** Logout: token'ın ailesini iptal eder. Bilinmeyen token sessizce yok sayılır. */
  async revokeFamilyOf(token: string): Promise<void> {
    const current = await this.findByToken(token);
    if (current) {
      await this.revokeFamily(current.familyId);
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private findByToken(token: string): Promise<RefreshToken | null> {
    if (!token) {
      return Promise.resolve(null);
    }
    return this.tokens.findOneBy({ tokenHash: hashRefreshToken(token) });
  }

  private async revokeReusedFamily(token: RefreshToken): Promise<void> {
    // token ve hash loglanmaz; sadece kimlikler
    this.logger.warn(
      `Refresh token tekrar kullanıldı, aile iptal ediliyor (userId=${token.userId}, familyId=${token.familyId}, tokenId=${token.id})`,
    );
    await this.revokeFamily(token.familyId);
  }

  private async insertToken(
    manager: EntityManager,
    userId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ id: string; issued: IssuedRefreshToken }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const ttlDays = this.configService.get('REFRESH_TOKEN_TTL_DAYS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
    const id = uuidv7();

    await manager.getRepository(RefreshToken).insert({
      id,
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt,
      revokedAt: null,
      replacedById: null,
      userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
      ip: meta.ip ?? null,
    });

    return { id, issued: { token, userId, familyId, expiresAt } };
  }
}
