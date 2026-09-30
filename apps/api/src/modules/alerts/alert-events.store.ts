import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export interface UpsertAlertEventInput {
  orgId: string;
  projectId: string;
  ruleId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  severity: string;
  cooldownHours: number;
}

export interface UpsertAlertEventResult {
  id: string;
  /** `true`: yeni satır ya da cooldown süresi geçmiş, bildirim gönderilmeli. */
  due: boolean;
}

/**
 * `alert_events` yazma (ARCHITECTURE §5.7, §11). Dedupe `(rule_id,
 * dedupe_key)` unique index'iyle, cooldown `ON CONFLICT ... DO UPDATE ...
 * WHERE` koşuluyla tek sorguda uygulanır: aynı olay için satır zaten varsa
 * ve `cooldown_hours` henüz geçmediyse güncelleme uygulanmaz, `RETURNING`
 * boş döner (`due: false`). `summary-store.ts`'teki kalıp.
 */
@Injectable()
export class AlertEventsStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async upsertIfDue(
    input: UpsertAlertEventInput,
  ): Promise<UpsertAlertEventResult> {
    const id = uuidv7();
    const rows = await this.dataSource.query<{ id: string }[]>(
      `
      INSERT INTO "alert_events"
        ("id", "org_id", "project_id", "rule_id", "dedupe_key", "payload",
         "severity", "triggered_at", "updated_at")
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      ON CONFLICT ("rule_id", "dedupe_key") DO UPDATE SET
        "triggered_at" = now(),
        "payload" = EXCLUDED."payload",
        "severity" = EXCLUDED."severity",
        "notified_at" = NULL,
        "notify_error" = NULL,
        "updated_at" = now()
      WHERE "alert_events"."org_id" = $2
        AND "alert_events"."triggered_at" <= now() - make_interval(hours => $8)
      RETURNING "id"
      `,
      [
        id,
        input.orgId,
        input.projectId,
        input.ruleId,
        input.dedupeKey,
        JSON.stringify(input.payload),
        input.severity,
        input.cooldownHours,
      ],
    );
    if (rows.length > 0) {
      return { id: rows[0].id, due: true };
    }
    const existing = await this.dataSource.query<{ id: string }[]>(
      `SELECT "id" FROM "alert_events" WHERE "rule_id" = $1 AND "dedupe_key" = $2`,
      [input.ruleId, input.dedupeKey],
    );
    return { id: existing[0]?.id ?? id, due: false };
  }

  /**
   * `notify` job'unun okuduğu satır. Tenant kapsaması yerine job data'daki
   * `alertEventId` doğrudan kullanılır (BaseProcessor zaten orgId'yi CLS'e
   * kurar); `NotifyService`'in ayrı bir `TenantRepository` almasını önler.
   */
  async findById(
    id: string,
  ): Promise<{ id: string; payload: Record<string, unknown> } | null> {
    const rows = await this.dataSource.query<
      { id: string; payload: Record<string, unknown> }[]
    >(`SELECT "id", "payload" FROM "alert_events" WHERE "id" = $1`, [id]);
    return rows[0] ?? null;
  }

  async markNotified(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "alert_events" SET "notified_at" = now(), "notify_error" = NULL, "updated_at" = now() WHERE "id" = $1`,
      [id],
    );
  }

  async markNotifyError(id: string, error: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "alert_events" SET "notify_error" = $2, "updated_at" = now() WHERE "id" = $1`,
      [id, error.slice(0, 2000)],
    );
  }
}
