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
import {
  Ga4DateRangeQueryDto,
  ListGa4LandingPagesQueryDto,
} from './dto/ga4-query.dto';
import {
  Ga4LandingPageListResponseDto,
  Ga4OverviewResponseDto,
  Ga4SyncResponseDto,
} from './dto/ga4-response.dto';
import { Ga4JobsService } from './ga4-jobs.service';
import { Ga4QueryService } from './ga4-query.service';

/**
 * GA4 manuel sync ve sorgu endpoint'leri (PLAN T1.6). `:projectId`
 * `ProjectAccessGuard`'dan geçer (org ve client_viewer scope kontrolü).
 */
@ApiTags('ga4')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId')
export class Ga4Controller {
  constructor(
    private readonly ga4Jobs: Ga4JobsService,
    private readonly ga4Query: Ga4QueryService,
  ) {}

  /** Son 3 günü yeniden çeker; iş kuyrukta yapılır (CLAUDE.md kural 6). */
  @Post('sync/ga4')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiAcceptedResponse({ type: Ga4SyncResponseDto })
  @ApiConflictResponse({ description: 'GA4_CONNECTION_NOT_ACTIVE' })
  async triggerSync(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<Ga4SyncResponseDto> {
    const runId = await this.ga4Jobs.triggerManualSync(
      org.orgId,
      projectId,
      todayUtc(),
    );
    return { runId };
  }

  /** Kanal kırılımlı toplamlar (`ga4_daily`). */
  @Get('ga4/overview')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: Ga4OverviewResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  overview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: Ga4DateRangeQueryDto,
  ): Promise<Ga4OverviewResponseDto> {
    return this.ga4Query.overview(projectId, query);
  }

  /** Landing page bazında toplanmış tablo; `channel` ile filtrelenir (ör. `Organic Search`). */
  @Get('ga4/landing-pages')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: Ga4LandingPageListResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  landingPages(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListGa4LandingPagesQueryDto,
  ): Promise<Ga4LandingPageListResponseDto> {
    return this.ga4Query.landingPages(projectId, query);
  }
}
