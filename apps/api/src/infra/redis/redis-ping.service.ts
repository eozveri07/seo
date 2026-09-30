import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EnvironmentVariables } from '../../config/environment-variables';
import { HealthCheckResultDto } from '../../modules/health/dto/health-response.dto';

const DEFAULT_TIMEOUT_MS = 1500;

@Injectable()
export class RedisPingService implements OnModuleDestroy {
  private client?: Redis;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async ping(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HealthCheckResultDto> {
    const start = Date.now();
    try {
      const client = this.getClient();
      if (client.status === 'wait' || client.status === 'end') {
        await client.connect();
      }
      await Promise.race([client.ping(), this.timeout(timeoutMs)]);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      this.reset();
      return { status: 'down', error: 'REDIS_UNAVAILABLE' };
    }
  }

  onModuleDestroy(): void {
    this.reset();
  }

  private getClient(): Redis {
    if (!this.client) {
      const client = new Redis(
        this.configService.get('REDIS_URL', { infer: true }),
        {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        },
      );
      client.on('error', () => {
        // bağlantı hataları process'i düşürmesin, bir sonraki ping yeni client açar
      });
      this.client = client;
    }
    return this.client;
  }

  private reset(): void {
    const client = this.client;
    this.client = undefined;
    client?.disconnect();
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('REDIS_PING_TIMEOUT')), ms);
    });
  }
}
