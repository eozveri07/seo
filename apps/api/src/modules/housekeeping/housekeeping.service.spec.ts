import { DataSource } from 'typeorm';
import { HousekeepingService } from './housekeeping.service';

function setup() {
  const query = jest.fn<Promise<unknown[]>, [string]>().mockResolvedValue([]);
  const dataSource = { query } as unknown as DataSource;
  const service = new HousekeepingService(dataSource);
  return { service, query };
}

/**
 * ARCHITECTURE §8.2: her cron'un doğru tabloyu ve koşulu hedeflediğini
 * `DataSource.query`'e geçen SQL üzerinden doğrular. Gerçek DB olmadan
 * çalışır (runner'da DB yok); gerçek `partman.run_maintenance_proc()` ve
 * silinen satır sayıları lokalde bir test DB'sine karşı doğrulanmalı.
 */
describe('HousekeepingService', () => {
  it('runPartmanMaintenance: partman.run_maintenance_proc() çağırır', async () => {
    const { service, query } = setup();

    await service.runPartmanMaintenance();

    expect(query).toHaveBeenCalledWith('CALL partman.run_maintenance_proc()');
  });

  it('cleanupExpiredTokensAndInvitations: süresi dolmuş/iptal refresh_tokens ve süresi geçmiş invitations siler', async () => {
    const { service, query } = setup();

    await service.cleanupExpiredTokensAndInvitations();

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /DELETE FROM "refresh_tokens"[\s\S]*"expires_at" < now\(\)[\s\S]*"revoked_at" IS NOT NULL/,
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /DELETE FROM "invitations"[\s\S]*"expires_at" < now\(\)/,
      ),
    );
  });

  it('cleanupOldJobRuns: 90 günden eski job_runs siler', async () => {
    const { service, query } = setup();

    await service.cleanupOldJobRuns();

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /DELETE FROM "job_runs"[\s\S]*"created_at" < now\(\) - interval '90 days'/,
      ),
    );
  });

  it('failStuckJobRuns: 2 saatten uzun running kalan job_runs kayıtlarını failed yapar', async () => {
    const { service, query } = setup();

    await service.failStuckJobRuns();

    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/UPDATE "job_runs"/);
    expect(sql).toMatch(/SET "status" = 'failed'/);
    expect(sql).toMatch(/"status" = 'running'/);
    expect(sql).toMatch(/"started_at" < now\(\) - interval '2 hours'/);
  });
});
