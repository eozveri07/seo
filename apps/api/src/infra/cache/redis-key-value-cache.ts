import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EnvironmentVariables } from '../../config/environment-variables';
import { KeyValueCache } from './key-value-cache';

/** Redis erişilemezken cache çağrılarının isteği bekletebileceği en uzun süre. */
const COMMAND_TIMEOUT_MS = 500;

/**
 * `REDIS_URL` üzerindeki cache. İlk komutta bağlanır; bağlantı hataları
 * process'i düşürmez, çağırana hata olarak döner (çağıran DB'ye düşer).
 */
@Injectable()
export class RedisKeyValueCache implements KeyValueCache, OnModuleDestroy {
  private readonly logger = new Logger(RedisKeyValueCache.name);
  private readonly client: Redis;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.client = new Redis(configService.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      commandTimeout: COMMAND_TIMEOUT_MS,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis bağlantı hatası: ${error.message}`);
    });
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
