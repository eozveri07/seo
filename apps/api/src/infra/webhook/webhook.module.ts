import { Module } from '@nestjs/common';
import { WebhookClient } from './webhook.client';

/**
 * Discord/Slack webhook client'ı. `DataForSeoClient` gibi (bkz.
 * `connectors.module.ts`) opsiyonel `options` parametresi taşıdığı için
 * factory ile üretilir; düz `providers: [WebhookClient]` Nest'in son
 * parametreyi enjekte etmeye çalışmasına (ve başarısız olmasına) yol açar.
 */
@Module({
  providers: [
    { provide: WebhookClient, useFactory: () => new WebhookClient() },
  ],
  exports: [WebhookClient],
})
export class WebhookModule {}
