import { Module } from '@nestjs/common';
import { ConnectionActivatedListener } from './connection-activated.listener';
import { Ga4QueryService } from './ga4-query.service';
import { Ga4SharedModule } from './ga4-shared.module';
import { Ga4Controller } from './ga4.controller';

/** API: GA4 manuel sync, sorgu endpoint'leri ve backfill başlatma. */
@Module({
  imports: [Ga4SharedModule],
  controllers: [Ga4Controller],
  providers: [Ga4QueryService, ConnectionActivatedListener],
})
export class Ga4Module {}
