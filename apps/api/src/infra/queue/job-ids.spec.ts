import {
  gscBackfillJobId,
  gscSyncJobId,
  gscSyncManualJobId,
  rankFetchJobId,
  rankLiveJobId,
  rankPostJobId,
} from './job-ids';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const RUN_ID = '0190f0e4-0000-7000-8000-000000000099';

/**
 * BullMQ (`Job.validateOptions`) özel id'de `:` varsa tam üç parça ister ve
 * tamsayı id'yi reddeder; aksi halde `add` hata fırlatır.
 */
function assertValidForBullmq(jobId: string): void {
  expect(jobId.split(':')).toHaveLength(3);
  expect(`${parseInt(jobId, 10)}`).not.toBe(jobId);
}

describe('job id yardımcıları', () => {
  it('gsc-sync id aynı proje ve gün için her zaman aynıdır', () => {
    expect(gscSyncJobId(PROJECT_ID, '2026-09-29')).toBe(
      `gsc-sync:${PROJECT_ID}:2026-09-29`,
    );
    expect(gscSyncJobId(PROJECT_ID, '2026-09-29')).toBe(
      gscSyncJobId(PROJECT_ID, '2026-09-29'),
    );
    expect(gscSyncJobId(PROJECT_ID, '2026-09-30')).not.toBe(
      gscSyncJobId(PROJECT_ID, '2026-09-29'),
    );
  });

  it('gsc-backfill id aynı proje ve gün için her zaman aynıdır', () => {
    expect(gscBackfillJobId(PROJECT_ID, '2025-06-01')).toBe(
      `gsc-backfill:${PROJECT_ID}:2025-06-01`,
    );
  });

  it("rank-post id'si günlük ve haftalık kapsamı ayırır", () => {
    expect(rankPostJobId(PROJECT_ID, '2026-09-28', 'daily')).not.toBe(
      rankPostJobId(PROJECT_ID, '2026-09-28', 'weekly'),
    );
  });

  it.each([
    gscSyncJobId(PROJECT_ID, '2026-09-29'),
    gscBackfillJobId(PROJECT_ID, '2025-06-01'),
    gscSyncManualJobId(PROJECT_ID, RUN_ID),
    rankPostJobId(PROJECT_ID, '2026-09-28', 'daily'),
    rankPostJobId(PROJECT_ID, '2026-09-28', 'weekly'),
    rankFetchJobId(PROJECT_ID, '09281234-1535-0066-0000-5b1f7e3c9a21'),
    rankLiveJobId(PROJECT_ID, RUN_ID),
  ])("%s BullMQ'nun özel id kurallarına uyar", (jobId) => {
    assertValidForBullmq(jobId);
  });
});
