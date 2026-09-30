import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { EnvironmentVariables } from '../../config/environment-variables';
import { HealthCheckResultDto } from '../../modules/health/dto/health-response.dto';

const DEFAULT_TIMEOUT_MS = 1500;

@Injectable()
export class DatabasePingService implements OnModuleDestroy {
  private pool?: Pool;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async ping(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HealthCheckResultDto> {
    const start = Date.now();
    try {
      const pool = this.getPool();
      await Promise.race([pool.query('SELECT 1'), this.timeout(timeoutMs)]);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      await this.reset();
      return { status: 'down', error: 'DATABASE_UNAVAILABLE' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }

  private getPool(): Pool {
    if (!this.pool) {
      const pool = new Pool({
        connectionString: this.configService.get('DATABASE_URL', {
          infer: true,
        }),
        max: 1,
      });
      pool.on('error', () => {
        // idle bağlantı hataları process'i düşürmesin, bir sonraki ping yeni pool açar
      });
      this.pool = pool;
    }
    return this.pool;
  }

  private async reset(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    await pool?.end().catch(() => undefined);
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('DATABASE_PING_TIMEOUT')), ms);
    });
  }
}
