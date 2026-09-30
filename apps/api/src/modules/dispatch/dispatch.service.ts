import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DAILY_DISPATCH_SOURCES,
  DailyDispatchSource,
  DispatchItem,
} from './daily-dispatch-source';
import { roundRobinByOrg } from './round-robin';
import {
  WEEKLY_DISPATCH_SOURCES,
  WeeklyDispatchSource,
} from './weekly-dispatch-source';

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
    @Inject(WEEKLY_DISPATCH_SOURCES)
    private readonly weeklySources: WeeklyDispatchSource[],
  ) {}

  async dispatchDaily(date: string): Promise<DispatchStats> {
    const collected = await Promise.all(
      this.sources.map((source) => source.collect(date)),
    );
    return this.enqueueAll('daily-dispatch', date, collected.flat());
  }

  /** `weekly-dispatch` (pazartesi): haftalık kaynakların işleri, aynı kurallarla. */
  async dispatchWeekly(date: string): Promise<DispatchStats> {
    const collected = await Promise.all(
      this.weeklySources.map((source) => source.collectWeekly(date)),
    );
    return this.enqueueAll('weekly-dispatch', date, collected.flat());
  }

  private async enqueueAll(
    name: string,
    date: string,
    collected: DispatchItem[],
  ): Promise<DispatchStats> {
    const items = roundRobinByOrg(collected);

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
      `${name} ${date}: ${stats.enqueued} job eklendi, ${stats.failed} hata`,
    );
    if (stats.failed > 0) {
      throw new Error(
        `${name} ${date}: ${stats.failed} job kuyruğa eklenemedi`,
      );
    }
    return stats;
  }
}
