import { Module } from '@nestjs/common';
import { RankingsController } from './rankings.controller';
import { RankingsSharedModule } from './rankings-shared.module';

/** API: rank geçmişi, günün SERP'i ve anlık kontrol. */
@Module({
  imports: [RankingsSharedModule],
  controllers: [RankingsController],
})
export class RankingsModule {}
