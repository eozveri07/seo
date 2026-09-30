import { Module } from '@nestjs/common';
import { AlertEvalComputeModule } from './alert-eval-compute.module';
import { AlertEvalProcessor } from './alert-eval.processor';
import { ReportsSharedModule } from '../reports/reports-shared.module';
import { AlertsSharedModule } from './alerts-shared.module';
import { NotifyProcessor } from './notify.processor';
import { NotifyService } from './notify.service';
import { SyncFailureAlertTriggerListener } from './sync-failure-alert-trigger.listener';

/**
 * Worker: `alert-eval` processor'ı ve `sync.failed` tetikleyicisi.
 * Listener burada yaşar: `SummaryTriggerListener`'daki gerekçenin aynısı
 * (bkz. `summary-processor.module.ts`) — `sync.failed` yalnızca
 * gsc-sync/ga4-sync processor'ları çalışırken worker sürecinde yayılır.
 */
@Module({
  imports: [AlertEvalComputeModule],
  providers: [AlertEvalProcessor, SyncFailureAlertTriggerListener],
})
export class AlertEvalProcessorModule {}

/**
 * Worker: `notify` processor'ı (e-posta/Discord/Slack gönderimi ve rapor
 * PDF maili, T1.15). `ReportsSharedModule` yalnız `REPORT_NOTIFIER`'ı
 * enjekte etmek için import edilir.
 */
@Module({
  imports: [AlertsSharedModule, ReportsSharedModule],
  providers: [NotifyProcessor, NotifyService],
})
export class NotifyProcessorModule {}
