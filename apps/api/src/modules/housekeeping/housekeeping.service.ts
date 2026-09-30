import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** `job_runs.status = 'running'`'in "takıldı" sayıldığı süre (ARCHITECTURE §8.2). */
export const STUCK_JOB_RUN_THRESHOLD_HOURS = 2;

/** `job_runs`'ın kalıcı geçmiş olarak saklandığı süre (ARCHITECTURE §8.2). */
export const JOB_RUN_RETENTION_DAYS = 90;

/**
 * ARCHITECTURE §8.2: sistem bakım cron'ları. Sistem işleridir, tenant scope'u
 * dışındadır (tüm organizasyonları kapsar); bu yüzden `TenantRepository`
 * değil doğrudan `DataSource` kullanılır (CLAUDE.md kural 4 yalnız tenant
 * verisine giden sorgular için geçerlidir).
 *
 * Yalnız `HousekeepingModule.register()` ile ve `SCHEDULER_ENABLED=true`
 * olan worker'da yüklenir; API process'i bu servisi hiç görmez.
 */
@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Günlük 03:00 UTC: pg_partman bakımı (eski partition'ların budanması, yenilerinin açılması). */
  @Cron('0 3 * * *', { name: 'housekeeping-partman-maintenance' })
  async runPartmanMaintenance(): Promise<void> {
    await this.dataSource.query('CALL partman.run_maintenance_proc()');
    this.logger.log('partman.run_maintenance_proc() çalıştı.');
  }

  /** Günlük 03:30 UTC: süresi dolmuş/iptal edilmiş refresh token'lar ve süresi geçmiş davetler. */
  @Cron('30 3 * * *', { name: 'housekeeping-token-invitation-cleanup' })
  async cleanupExpiredTokensAndInvitations(): Promise<void> {
    const tokens = await this.dataSource.query<{ count: string }[]>(
      `DELETE FROM "refresh_tokens"
       WHERE "expires_at" < now() OR "revoked_at" IS NOT NULL
       RETURNING 1`,
    );
    const invitations = await this.dataSource.query<{ count: string }[]>(
      `DELETE FROM "invitations" WHERE "expires_at" < now() RETURNING 1`,
    );
    this.logger.log(
      `Temizlendi: refresh_tokens=${tokens.length} invitations=${invitations.length}`,
    );
  }

  /** Haftalık: 90 günden eski `job_runs` kayıtları. */
  @Cron('0 4 * * 0', { name: 'housekeeping-job-runs-retention' })
  async cleanupOldJobRuns(): Promise<void> {
    const deleted = await this.dataSource.query<unknown[]>(
      `DELETE FROM "job_runs"
       WHERE "created_at" < now() - interval '${JOB_RUN_RETENTION_DAYS} days'
       RETURNING 1`,
    );
    this.logger.log(`Temizlendi: job_runs=${deleted.length}`);
  }

  /** Saatlik: 2 saatten uzun süredir `running` kalan `job_runs` `failed` yapılır. */
  @Cron('0 * * * *', { name: 'housekeeping-stuck-job-runs' })
  async failStuckJobRuns(): Promise<void> {
    const failed = await this.dataSource.query<unknown[]>(
      `UPDATE "job_runs"
       SET "status" = 'failed', "finished_at" = now(),
           "error" = 'housekeeping: ${STUCK_JOB_RUN_THRESHOLD_HOURS} saatten uzun süredir running kaldı'
       WHERE "status" = 'running'
         AND "started_at" < now() - interval '${STUCK_JOB_RUN_THRESHOLD_HOURS} hours'
       RETURNING 1`,
    );
    this.logger.log(`Failed yapıldı: job_runs=${failed.length}`);
  }
}
