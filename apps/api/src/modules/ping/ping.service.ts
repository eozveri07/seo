import { Injectable, Logger } from '@nestjs/common';
import { PingJobData } from '../../infra/queue/queues';

export interface PingResult {
  pong: true;
  message?: string;
}

/**
 * Örnek servis (T1.5'te silinecek). `ping` job'unun iş mantığı burada,
 * `PingProcessor` yalnız çağırır (CLAUDE.md kural 3).
 */
@Injectable()
export class PingService {
  private readonly logger = new Logger(PingService.name);

  execute(data: PingJobData): Promise<PingResult> {
    this.logger.log(`pong (orgId=${data.orgId}): ${data.message ?? ''}`);
    return Promise.resolve({ pong: true, message: data.message });
  }
}
