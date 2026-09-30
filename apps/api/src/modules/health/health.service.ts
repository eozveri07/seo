import { Injectable } from '@nestjs/common';
import { DatabasePingService } from '../../infra/database-ping/database-ping.service';
import { RedisPingService } from '../../infra/redis/redis-ping.service';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly databasePingService: DatabasePingService,
    private readonly redisPingService: RedisPingService,
  ) {}

  async check(): Promise<HealthResponseDto> {
    const [database, redis] = await Promise.all([
      this.databasePingService.ping(),
      this.redisPingService.ping(),
    ]);

    const status =
      database.status === 'up' && redis.status === 'up' ? 'ok' : 'error';

    return { status, checks: { database, redis } };
  }
}
