import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportQueryDto } from './dto/list-report-query.dto';
import {
  CreateReportResponseDto,
  ReportListResponseDto,
  ReportResponseDto,
} from './dto/report-response.dto';
import { ReportsService } from './reports.service';

/** Proje içindeki raporlar (ARCHITECTURE §5.7, §12). */
@ApiTags('reports')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Roles(...ROLE_MATRIX.reportView)
  @ApiOkResponse({ type: ReportListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListReportQueryDto,
  ): Promise<ReportListResponseDto> {
    const page = await this.reports.list(projectId, query);
    return {
      ...page,
      items: page.items.map((item) => ReportResponseDto.fromEntity(item)),
    };
  }

  @Get(':reportId')
  @Roles(...ROLE_MATRIX.reportView)
  @ApiOkResponse({ type: ReportResponseDto })
  @ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<ReportResponseDto> {
    const report = await this.reports.findOne(projectId, reportId);
    return ReportResponseDto.fromEntity(report);
  }

  @Post()
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: CreateReportResponseDto })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateReportDto,
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: { id: string },
  ): Promise<CreateReportResponseDto> {
    const runId = await this.reports.create(org.orgId, {
      projectId,
      type: dto.type,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      analystNote: dto.analystNote,
      createdBy: user.id,
    });
    return { runId };
  }

  @Get(':reportId/download')
  @Roles(...ROLE_MATRIX.reportView)
  @ApiOkResponse({ description: 'PDF stream' })
  @ApiNotFoundResponse({
    description: 'REPORT_NOT_FOUND, REPORT_FILE_NOT_FOUND',
  })
  async download(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.reports.download(
      projectId,
      reportId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(stream);
  }
}
