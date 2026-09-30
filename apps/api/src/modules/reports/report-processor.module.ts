import { Module } from '@nestjs/common';
import { ReportRendererService } from './report-renderer.service';
import { ReportProcessor } from './report.processor';
import { ReportsSharedModule } from './reports-shared.module';

/** Worker: `report` processor'ı (Playwright PDF üretimi, ARCHITECTURE §12). */
@Module({
  imports: [ReportsSharedModule],
  providers: [ReportRendererService, ReportProcessor],
})
export class ReportProcessorModule {}
