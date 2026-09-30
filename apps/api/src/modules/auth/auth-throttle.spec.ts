import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { buildThrottlerOptions } from './auth-throttle';

type OptionsObject = Exclude<ThrottlerModuleOptions, unknown[]>;

describe('buildThrottlerOptions', () => {
  it('Redis storage kullanır ve açılışta bağlanmaz (lazyConnect)', () => {
    const options = buildThrottlerOptions(
      'redis://localhost:6379',
    ) as OptionsObject;
    const storage = options.storage as ThrottlerStorageRedisService;

    try {
      expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
      expect(storage.redis.status).toBe('wait');
    } finally {
      storage.onModuleDestroy();
    }
  });
});
