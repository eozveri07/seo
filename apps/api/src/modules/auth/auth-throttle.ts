import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Logger } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

/** Auth controller'ının genel limiti; IP başına dakikada. */
export const AUTH_DEFAULT_THROTTLE = { ttl: 60_000, limit: 20 };

/** Login: IP başına dakikada 5 deneme. */
export const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 5 } };

/** Refresh: IP başına dakikada 10 deneme (birden fazla sekme için pay bırakır). */
export const REFRESH_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

const logger = new Logger('ThrottlerStorage');

/**
 * Throttler sayaçları Redis'te tutulur; birden fazla API instance'ı aynı
 * limiti paylaşır. `lazyConnect`: Redis'e ilk throttle edilen istekte bağlanılır.
 */
export function buildThrottlerOptions(
  redisUrl: string,
): ThrottlerModuleOptions {
  const storage = new ThrottlerStorageRedisService(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  storage.redis.on('error', (error: Error) => {
    logger.warn(`Redis bağlantı hatası: ${error.message}`);
  });
  return {
    throttlers: [{ name: 'default', ...AUTH_DEFAULT_THROTTLE }],
    storage,
  };
}
