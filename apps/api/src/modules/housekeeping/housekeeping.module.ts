import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HousekeepingService } from './housekeeping.service';

/**
 * ARCHITECTURE §8.2: sistem bakım cron'ları (pg_partman, süresi dolmuş
 * refresh token ve davet temizliği, eski job_runs temizliği, takılı
 * job_runs düzeltme). Sadece worker process'inde ve `SCHEDULER_ENABLED=true`
 * iken `WorkerModule` tarafından `register()` ile yüklenir; API process'i
 * bu modülü hiç import etmez.
 */
@Module({})
export class HousekeepingModule {
  static register(): DynamicModule {
    return {
      module: HousekeepingModule,
      imports: [ScheduleModule.forRoot()],
      providers: [HousekeepingService],
    };
  }
}
