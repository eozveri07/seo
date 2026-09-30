import { Module } from '@nestjs/common';
import { ReportTokenGuard } from './guards/report-token.guard';
import { ReportDataController } from './report-data.controller';
import { ReportSchedulesController } from './report-schedules.controller';
import { ReportsSharedModule } from './reports-shared.module';
import { ReportsController } from './reports.controller';

/** API: rapor CRUD'u, manuel oluşturma, indirme, schedule CRUD'u ve print verisi. */
@Module({
  imports: [ReportsSharedModule],
  controllers: [
    ReportsController,
    ReportSchedulesController,
    ReportDataController,
  ],
  providers: [ReportTokenGuard],
})
export class ReportsModule {}
