import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsage } from './entities/api-usage.entity';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

/** ARCHITECTURE §5.6: `api_usage` yazımı ve maliyet raporu. */
@Module({
  imports: [TypeOrmModule.forFeature([ApiUsage])],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
