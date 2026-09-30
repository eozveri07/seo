import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * ARCHITECTURE §8.2: sistem bakım cron'ları (pg_partman, süresi dolmuş
 * refresh token temizliği, eski job_runs temizliği). Sadece worker
 * process'inde ve `SCHEDULER_ENABLED=true` iken `WorkerModule` tarafından
 * `register()` ile yüklenir; API process'i bu modülü hiç import etmez.
 *
 * Cron'lar T1.16'da eklenecek, şimdilik yalnız `@nestjs/schedule` kurulur.
 */
@Module({})
export class HousekeepingModule {
  static register(): DynamicModule {
    return {
      module: HousekeepingModule,
      imports: [ScheduleModule.forRoot()],
    };
  }
}
