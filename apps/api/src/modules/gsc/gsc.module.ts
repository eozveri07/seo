import { Module } from '@nestjs/common';
import { ConnectionActivatedListener } from './connection-activated.listener';
import { GscQueryService } from './gsc-query.service';
import { GscSharedModule } from './gsc-shared.module';
import { GscController } from './gsc.controller';

/** API: GSC manuel sync, sorgu endpoint'leri ve backfill başlatma. */
@Module({
  imports: [GscSharedModule],
  controllers: [GscController],
  providers: [GscQueryService, ConnectionActivatedListener],
})
export class GscModule {}
