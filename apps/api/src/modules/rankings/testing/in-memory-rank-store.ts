import { v7 as uuidv7 } from 'uuid';
import { RankTaskStatus } from '../entities/rank-task.entity';
import {
  ClaimedRankTask,
  MAX_RANK_TASK_ATTEMPTS,
  RankDailyRow,
  RankDay,
  RankStore,
  RankTaskRow,
  ReadyRankTask,
} from '../rank-store';

export interface InMemoryRankTask extends RankTaskRow {
  orgId: string;
  postedAt: Date | null;
  attempts: number;
  error: string | null;
}

/**
 * Testler için `RankStore`'un bellek içi karşılığı: SQL'deki kuralları
 * (unique `(tracked_keyword_id, check_date)`, gönderilememiş `failed`
 * task'ın deneme hakkı varsa yeniden ayrılması, açık task sayımı, 24 saat temizliği) aynen
 * uygular. Tenant metodları `orgId` alanındaki org'la çalışır.
 */
export class InMemoryRankStore implements Omit<
  RankStore,
  'dataSource' | 'cls'
> {
  readonly tasks: InMemoryRankTask[] = [];
  readonly daily = new Map<string, RankDailyRow & { orgId: string }>();

  constructor(public orgId: string) {}

  claimTasks(
    projectId: string,
    checkDate: string,
    trackedKeywordIds: string[],
  ): Promise<ClaimedRankTask[]> {
    const claimed: ClaimedRankTask[] = [];
    for (const trackedKeywordId of trackedKeywordIds) {
      const existing = this.tasks.find(
        (task) =>
          task.trackedKeywordId === trackedKeywordId &&
          task.checkDate === checkDate,
      );
      if (!existing) {
        const task: InMemoryRankTask = {
          id: uuidv7(),
          orgId: this.orgId,
          projectId,
          trackedKeywordId,
          checkDate,
          providerTaskId: null,
          status: RankTaskStatus.Posted,
          postedAt: new Date(),
          attempts: 1,
          error: null,
        };
        this.tasks.push(task);
        claimed.push({ id: task.id, trackedKeywordId });
      } else if (
        existing.orgId === this.orgId &&
        existing.status === RankTaskStatus.Failed &&
        existing.providerTaskId === null &&
        existing.attempts < MAX_RANK_TASK_ATTEMPTS
      ) {
        Object.assign(existing, {
          status: RankTaskStatus.Posted,
          providerTaskId: null,
          postedAt: new Date(),
          attempts: existing.attempts + 1,
          error: null,
        });
        claimed.push({ id: existing.id, trackedKeywordId });
      }
    }
    return Promise.resolve(claimed);
  }

  setProviderTaskIds(
    assignments: { id: string; providerTaskId: string }[],
  ): Promise<void> {
    for (const { id, providerTaskId } of assignments) {
      const task = this.own(id);
      if (task) {
        task.providerTaskId = providerTaskId;
      }
    }
    return Promise.resolve();
  }

  markFailed(taskIds: string[], error: string): Promise<void> {
    for (const id of taskIds) {
      const task = this.own(id);
      if (task) {
        task.status = RankTaskStatus.Failed;
        task.error = error;
      }
    }
    return Promise.resolve();
  }

  findTask(taskId: string): Promise<RankTaskRow | null> {
    const task = this.own(taskId);
    return Promise.resolve(task ? { ...task } : null);
  }

  markFetched(taskId: string): Promise<void> {
    const task = this.own(taskId);
    if (task) {
      task.status = RankTaskStatus.Fetched;
      task.error = null;
    }
    return Promise.resolve();
  }

  countOpenTasks(projectId: string, checkDate: string): Promise<number> {
    return Promise.resolve(
      this.tasks.filter(
        (task) =>
          task.orgId === this.orgId &&
          task.projectId === projectId &&
          task.checkDate === checkDate &&
          (task.status === RankTaskStatus.Posted ||
            task.status === RankTaskStatus.Ready),
      ).length,
    );
  }

  keywordsWithTaskBetween(
    projectId: string,
    trackedKeywordIds: string[],
    from: string,
    to: string,
  ): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        this.tasks
          .filter(
            (task) =>
              task.orgId === this.orgId &&
              task.projectId === projectId &&
              trackedKeywordIds.includes(task.trackedKeywordId) &&
              task.checkDate >= from &&
              task.checkDate <= to &&
              task.status !== RankTaskStatus.Failed,
          )
          .map((task) => task.trackedKeywordId),
      ),
    );
  }

  upsertRankDaily(row: RankDailyRow): Promise<void> {
    this.daily.set(`${row.date}:${row.trackedKeywordId}`, {
      ...row,
      orgId: this.orgId,
    });
    return Promise.resolve();
  }

  systemMarkReady(providerTaskIds: string[]): Promise<ReadyRankTask[]> {
    const ready: ReadyRankTask[] = [];
    for (const task of this.tasks) {
      if (
        task.providerTaskId &&
        providerTaskIds.includes(task.providerTaskId) &&
        (task.status === RankTaskStatus.Posted ||
          task.status === RankTaskStatus.Ready)
      ) {
        task.status = RankTaskStatus.Ready;
        ready.push({
          id: task.id,
          orgId: task.orgId,
          projectId: task.projectId,
          providerTaskId: task.providerTaskId,
        });
      }
    }
    return Promise.resolve(ready);
  }

  systemFailStale(postedBefore: Date, error: string): Promise<RankDay[]> {
    const days = new Map<string, RankDay>();
    for (const task of this.tasks) {
      if (
        (task.status === RankTaskStatus.Posted ||
          task.status === RankTaskStatus.Ready) &&
        task.postedAt !== null &&
        task.postedAt < postedBefore
      ) {
        task.status = RankTaskStatus.Failed;
        task.error = error;
        days.set(`${task.orgId}:${task.projectId}:${task.checkDate}`, {
          orgId: task.orgId,
          projectId: task.projectId,
          checkDate: task.checkDate,
        });
      }
    }
    return Promise.resolve([...days.values()]);
  }

  private own(id: string): InMemoryRankTask | undefined {
    return this.tasks.find(
      (task) => task.id === id && task.orgId === this.orgId,
    );
  }
}
