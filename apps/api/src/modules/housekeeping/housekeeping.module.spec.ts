import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { HousekeepingModule } from './housekeeping.module';

/** `DataSource`'u `HousekeepingModule`'ün göreceği şekilde global sağlayan test double'ı. */
@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useValue: { query: jest.fn().mockResolvedValue([]) },
    },
  ],
  exports: [getDataSourceToken()],
})
class FakeDatabaseModule {}

const CRON_JOB_NAMES = [
  'housekeeping-partman-maintenance',
  'housekeeping-token-invitation-cleanup',
  'housekeeping-job-runs-retention',
  'housekeeping-stuck-job-runs',
];

/**
 * ARCHITECTURE §8.2: bakımın dört işi de yalnız `HousekeepingModule` yüklüyken
 * (yani `SCHEDULER_ENABLED=true` olan worker'da, bkz. `worker.module.spec.ts`)
 * `SchedulerRegistry`'ye kayıt olur. `app.module.spec.ts` API process'inin
 * `HousekeepingModule`'ü hiç import etmediğini ayrıca doğrular.
 */
describe('HousekeepingModule', () => {
  it("dört bakım cron'unu da SchedulerRegistry'ye kaydeder", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeDatabaseModule, HousekeepingModule.register()],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });

    try {
      await app.init();
      const registry = app.get(SchedulerRegistry);
      const registeredNames = registry.getCronJobs().keys();

      expect([...registeredNames].sort()).toEqual([...CRON_JOB_NAMES].sort());
    } finally {
      await app.close();
    }
  });
});
