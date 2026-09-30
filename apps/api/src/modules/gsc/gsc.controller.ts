import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { todayUtc } from '../../common/dates/utc-date';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { GscOverviewQueryDto, ListGscRowsQueryDto } from './dto/gsc-query.dto';
import {
  GscOverviewResponseDto,
  GscPageListResponseDto,
  GscQueryListResponseDto,
  GscSyncResponseDto,
} from './dto/gsc-response.dto';
import { GscJobsService } from './gsc-jobs.service';
import { GscQueryService } from './gsc-query.service';
import { Md5HashPipe } from './md5-hash.pipe';

/**
 * GSC manuel sync ve sorgu endpoint'leri (PLAN T1.5). `:projectId`
 * `ProjectAccessGuard`'dan geçer (org ve client_viewer scope kontrolü).
 */
@ApiTags('gsc')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId')
export class GscController {
  constructor(
    private readonly gscJobs: GscJobsService,
    private readonly gscQuery: GscQueryService,
  ) {}

  /** Son 5 günü yeniden çeker; iş kuyrukta yapılır (CLAUDE.md kural 6). */
  @Post('sync/gsc')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiAcceptedResponse({ type: GscSyncResponseDto })
  @ApiConflictResponse({ description: 'GSC_CONNECTION_NOT_ACTIVE' })
  async triggerSync(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<GscSyncResponseDto> {
    const runId = await this.gscJobs.triggerManualSync(
      org.orgId,
      projectId,
      todayUtc(),
    );
    return { runId };
  }

  /** Site toplamları ve günlük seri (`gsc_site_daily`); `compare` ile karşılaştırma dönemi. */
  @Get('gsc/overview')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: GscOverviewResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  overview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: GscOverviewQueryDto,
  ): Promise<GscOverviewResponseDto> {
    return this.gscQuery.overview(projectId, query);
  }

  /** Sorgu bazında toplanmış tablo (`gsc_daily`). */
  @Get('gsc/queries')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: GscQueryListResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  queries(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListGscRowsQueryDto,
  ): Promise<GscQueryListResponseDto> {
    return this.gscQuery.queries(projectId, query);
  }

  /** Sayfa bazında toplanmış tablo (`gsc_page_daily`). */
  @Get('gsc/pages')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: GscPageListResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  pages(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListGscRowsQueryDto,
  ): Promise<GscPageListResponseDto> {
    return this.gscQuery.pages(projectId, query);
  }

  /** Bir sorgunun sayfaları (`gsc_daily`); `hash` = `queryHash`. */
  @Get('gsc/queries/:hash/pages')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: GscPageListResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  queryPages(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('hash', Md5HashPipe) hash: string,
    @Query() query: ListGscRowsQueryDto,
  ): Promise<GscPageListResponseDto> {
    return this.gscQuery.queryPages(projectId, hash, query);
  }

  /** Bir sayfanın sorguları (`gsc_daily`); `hash` = `pageHash`. */
  @Get('gsc/pages/:hash/queries')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: GscQueryListResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  pageQueries(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('hash', Md5HashPipe) hash: string,
    @Query() query: ListGscRowsQueryDto,
  ): Promise<GscQueryListResponseDto> {
    return this.gscQuery.pageQueries(projectId, hash, query);
  }
}
