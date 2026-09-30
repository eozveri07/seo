import { Module } from '@nestjs/common';
import { ConnectionActivatedListener } from './connection-activated.listener';
import { GscSharedModule } from './gsc-shared.module';
import { GscController } from './gsc.controller';

/** API: GSC manuel sync, sorgu endpoint'leri ve backfill başlatma. */
@Module({
  imports: [GscSharedModule],
  controllers: [GscController],
  providers: [ConnectionActivatedListener],
})
export class GscModule {}
