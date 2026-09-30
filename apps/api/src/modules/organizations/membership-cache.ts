import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KEY_VALUE_CACHE,
  type KeyValueCache,
} from '../../infra/cache/key-value-cache';
import { OrgRole } from '../../common/tenancy/org-role';

export interface CachedMembership {
  role: OrgRole;
  clientId: string | null;
}

/** ARCHITECTURE §4.3: TenantGuard'ın membership cache'i, 60 sn. */
export const MEMBERSHIP_CACHE_TTL_SECONDS = 60;

export function membershipCacheKey(orgId: string, userId: string): string {
  return `tenancy:membership:${orgId}:${userId}`;
}

/**
 * Yalnız var olan üyelikler cache'lenir; "üye değil" sonucu cache'lenmez, bu
 * yüzden yeni üyelikte invalidation gerekmez. Rol değişimi, çıkarma ve org
 * silmede ilgili anahtarlar silinir.
 *
 * Redis erişilemezse okuma DB'ye düşer. Silme başarısız olursa eski kayıt en
 * fazla TTL kadar yaşar; bu durum error olarak loglanır.
 */
@Injectable()
export class MembershipCache {
  private readonly logger = new Logger(MembershipCache.name);

  constructor(@Inject(KEY_VALUE_CACHE) private readonly cache: KeyValueCache) {}

  async get(
    orgId: string,
    userId: string,
  ): Promise<CachedMembership | undefined> {
    try {
      const raw = await this.cache.get(membershipCacheKey(orgId, userId));
      return raw ? (JSON.parse(raw) as CachedMembership) : undefined;
    } catch (error) {
      this.logger.warn(`Membership cache okunamadı: ${errorMessage(error)}`);
      return undefined;
    }
  }

  async set(
    orgId: string,
    userId: string,
    membership: CachedMembership,
  ): Promise<void> {
    try {
      await this.cache.set(
        membershipCacheKey(orgId, userId),
        JSON.stringify({
          role: membership.role,
          clientId: membership.clientId,
        }),
        MEMBERSHIP_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Membership cache yazılamadı: ${errorMessage(error)}`);
    }
  }

  async invalidate(orgId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.cache.del(
        ...userIds.map((userId) => membershipCacheKey(orgId, userId)),
      );
    } catch (error) {
      this.logger.error(
        `Membership cache silinemedi (orgId=${orgId}, userIds=${userIds.join(',')}); kayıtlar en fazla ${MEMBERSHIP_CACHE_TTL_SECONDS} sn eski kalabilir: ${errorMessage(error)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
