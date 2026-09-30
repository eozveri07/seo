import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DAILY_DISPATCH_SOURCES,
  DailyDispatchSource,
} from './daily-dispatch-source';
import { roundRobinByOrg } from './round-robin';

export interface DispatchStats {
  date: string;
  enqueued: number;
  failed: number;
  byKind: Record<string, number>;
}

/**
 * `daily-dispatch` (ARCHITECTURE §8.1): tüm kaynaklardan günün işlerini
 * toplar, org'lara göre round-robin sıralar ve deterministik jobId'lerle
 * kuyruğa ekler. Bir öğe eklenemezse diğerleri yine eklenir; hata varsa
 * sonunda fırlatılır, BullMQ dispatch job'unu yeniden dener (aynı jobId'ler
 * tekrar eklenmez).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @Inject(DAILY_DISPATCH_SOURCES)
    private readonly sources: DailyDispatchSource[],
  ) {}

  async dispatchDaily(date: string): Promise<DispatchStats> {
    const collected = await Promise.all(
      this.sources.map((source) => source.collect(date)),
    );
    const items = roundRobinByOrg(collected.flat());

    const stats: DispatchStats = { date, enqueued: 0, failed: 0, byKind: {} };
    for (const item of items) {
      try {
        await item.enqueue();
        stats.enqueued += 1;
        stats.byKind[item.kind] = (stats.byKind[item.kind] ?? 0) + 1;
      } catch (error) {
        stats.failed += 1;
        this.logger.error(
          `dispatch eklenemedi: kind=${item.kind} orgId=${item.orgId} projectId=${item.projectId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `daily-dispatch ${date}: ${stats.enqueued} job eklendi, ${stats.failed} hata`,
    );
    if (stats.failed > 0) {
      throw new Error(
        `daily-dispatch ${date}: ${stats.failed} job kuyruğa eklenemedi`,
      );
    }
    return stats;
  }
}
