import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { SkipTenant } from '../../common/tenancy/skip-tenant.decorator';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { ReportDataResponseDto } from './dto/report-data-response.dto';
import { Report } from './entities/report.entity';
import { ReportTokenGuard } from './guards/report-token.guard';
import { ReportDataService } from './report-data.service';
import { ReportNotFoundError } from './reports.errors';

/**
 * `GET /reports/:id/data` (ARCHITECTURE §12): `JwtAuthGuard`/`TenantGuard`'ı
 * atlayan tek endpoint, yalnız `ReportTokenGuard`'ın doğruladığı rapor
 * token'ıyla erişilir. Panelin `/print/reports/:id` route'u bu endpoint'i
 * çağırır.
 */
@ApiTags('reports')
@Controller('reports')
export class ReportDataController {
  constructor(
    @InjectTenantRepository(Report)
    private readonly reports: TenantRepository<Report>,
    private readonly reportData: ReportDataService,
  ) {}

  @Get(':id/data')
  @Public()
  @SkipTenant()
  @UseGuards(ReportTokenGuard)
  @ApiOkResponse({ type: ReportDataResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_REPORT_TOKEN' })
  async data(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReportDataResponseDto> {
    const report = await this.reports.findOneBy({ id });
    if (!report) {
      throw new ReportNotFoundError();
    }
    return this.reportData.build(report);
  }
}
