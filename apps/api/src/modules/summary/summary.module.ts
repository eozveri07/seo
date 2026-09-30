import { Module } from '@nestjs/common';
import { SummarySharedModule } from './summary-shared.module';
import { SummaryController } from './summary.controller';

/** API: proje özeti sorgu endpoint'i. */
@Module({
  imports: [SummarySharedModule],
  controllers: [SummaryController],
})
export class SummaryModule {}
