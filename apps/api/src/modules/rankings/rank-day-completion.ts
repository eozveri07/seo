import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RANK_DAY_COMPLETED_EVENT,
  RankDayCompletedEvent,
} from '../../common/events/rank-day-completed.event';
import { RankStore } from './rank-store';

/**
 * ARCHITECTURE §9.3 adım 4: projenin o günkü açık task'ı kalmadıysa
 * `rank.day_completed` yayılır. Post (hepsi hatalı), fetch ve takılan task
 * temizliği sonrası çağrılır; CLS'te org kurulu olmalıdır.
 */
@Injectable()
export class RankDayCompletion {
  private readonly logger = new Logger(RankDayCompletion.name);

  constructor(
    private readonly store: RankStore,
    private readonly events: EventEmitter2,
  ) {}

  async checkCompleted(
    orgId: string,
    projectId: string,
    date: string,
  ): Promise<boolean> {
    const open = await this.store.countOpenTasks(projectId, date);
    if (open > 0) {
      return false;
    }
    this.logger.log(
      `rank günü tamamlandı: orgId=${orgId} projectId=${projectId} date=${date}`,
    );
    this.events.emit(
      RANK_DAY_COMPLETED_EVENT,
      new RankDayCompletedEvent(orgId, projectId, date),
    );
    return true;
  }
}
