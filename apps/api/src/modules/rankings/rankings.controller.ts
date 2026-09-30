import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { todayUtc } from '../../common/dates/utc-date';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { UserThrottlerGuard } from '../../common/throttling/user-throttler.guard';
import { RankHistoryQueryDto, RankSerpQueryDto } from './dto/rank-query.dto';
import {
  RankCheckNowResponseDto,
  RankHistoryResponseDto,
  RankSerpResponseDto,
} from './dto/rank-response.dto';
import { RankJobsService } from './rank-jobs.service';
import { RankingsQueryService } from './rankings-query.service';

/** Anlık kontrol: kullanıcı başına dakikada 5 (ücretli `live/advanced` çağrısı). */
export const CHECK_NOW_THROTTLE = { default: { ttl: 60_000, limit: 5 } };

/**
 * Rank sorguları ve anlık kontrol (PLAN T1.9). `:projectId`
 * `ProjectAccessGuard`'dan geçer (org ve client_viewer scope kontrolü).
 */
@ApiTags('rankings')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId')
export class RankingsController {
  constructor(
    private readonly rankJobs: RankJobsService,
    private readonly rankingsQuery: RankingsQueryService,
  ) {}

  /**
   * Keyword'ü şimdi `live/advanced` ile kontrol eder; iş kuyrukta yapılır
   * (CLAUDE.md kural 6), sonuç `source = dfs_live` olarak bugünün satırına
   * yazılır.
   */
  @Post('keywords/:keywordId/check-now')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...ROLE_MATRIX.contentManage)
  @UseGuards(UserThrottlerGuard)
  @Throttle(CHECK_NOW_THROTTLE)
  @ApiAcceptedResponse({ type: RankCheckNowResponseDto })
  @ApiNotFoundResponse({
    description: 'PROJECT_NOT_FOUND, TRACKED_KEYWORD_NOT_FOUND',
  })
  @ApiTooManyRequestsResponse({ description: 'Kullanıcı başına limit aşıldı' })
  async checkNow(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keywordId', ParseUUIDPipe) keywordId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<RankCheckNowResponseDto> {
    const runId = await this.rankJobs.triggerCheckNow(
      org.orgId,
      projectId,
      keywordId,
      todayUtc(),
    );
    return { runId };
  }

  /** Keyword'lerin günlük pozisyon geçmişi (`rank_daily`). */
  @Get('rankings/history')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: RankHistoryResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  history(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: RankHistoryQueryDto,
  ): Promise<RankHistoryResponseDto> {
    return this.rankingsQuery.history(projectId, query);
  }

  /** O günün SERP'i: pozisyon, URL, SERP özellikleri ve ilk 10 rakip. */
  @Get('rankings/serp/:keywordId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: RankSerpResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiNotFoundResponse({
    description: 'PROJECT_NOT_FOUND, RANK_RESULT_NOT_FOUND',
  })
  serp(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keywordId', ParseUUIDPipe) keywordId: string,
    @Query() query: RankSerpQueryDto,
  ): Promise<RankSerpResponseDto> {
    return this.rankingsQuery.serp(projectId, keywordId, query.date);
  }
}
