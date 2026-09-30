import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { CreateReportScheduleDto } from './dto/create-report-schedule.dto';
import {
  ReportScheduleListResponseDto,
  ReportScheduleResponseDto,
} from './dto/report-schedule-response.dto';
import { UpdateReportScheduleDto } from './dto/update-report-schedule.dto';
import { ReportSchedulesService } from './report-schedules.service';

/** Proje içindeki otomatik rapor zamanlamaları (ARCHITECTURE §5.7, §12). */
@ApiTags('reports')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/report-schedules')
export class ReportSchedulesController {
  constructor(private readonly schedules: ReportSchedulesService) {}

  @Get()
  @Roles(...ROLE_MATRIX.reportView)
  @ApiOkResponse({ type: ReportScheduleListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ReportScheduleListResponseDto> {
    const items = await this.schedules.list(projectId);
    return {
      items: items.map((item) => ReportScheduleResponseDto.fromEntity(item)),
    };
  }

  @Get(':scheduleId')
  @Roles(...ROLE_MATRIX.reportView)
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  @ApiNotFoundResponse({ description: 'REPORT_SCHEDULE_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ): Promise<ReportScheduleResponseDto> {
    const schedule = await this.schedules.findOne(projectId, scheduleId);
    return ReportScheduleResponseDto.fromEntity(schedule);
  }

  @Post()
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: ReportScheduleResponseDto })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateReportScheduleDto,
  ): Promise<ReportScheduleResponseDto> {
    const schedule = await this.schedules.create({ projectId, ...dto });
    return ReportScheduleResponseDto.fromEntity(schedule);
  }

  @Patch(':scheduleId')
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiOkResponse({ type: ReportScheduleResponseDto })
  @ApiNotFoundResponse({ description: 'REPORT_SCHEDULE_NOT_FOUND' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateReportScheduleDto,
  ): Promise<ReportScheduleResponseDto> {
    const schedule = await this.schedules.update(projectId, scheduleId, dto);
    return ReportScheduleResponseDto.fromEntity(schedule);
  }

  @Delete(':scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'REPORT_SCHEDULE_NOT_FOUND' })
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ): Promise<void> {
    await this.schedules.delete(projectId, scheduleId);
  }
}
