import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { ProjectSummaryQueryDto } from './dto/summary-query.dto';
import { ProjectSummaryResponseDto } from './dto/summary-response.dto';
import { SummaryQueryService } from './summary-query.service';

/**
 * Proje özeti (PLAN T1.10). `:projectId` `ProjectAccessGuard`'dan geçer
 * (org ve client_viewer scope kontrolü). Org genelindeki proje kartları
 * `GET /projects/summary` altında (`ProjectsController`, `:projectId`
 * route'uyla çakışmaması için statik yol aynı controller'da).
 */
@ApiTags('summary')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId')
export class SummaryController {
  constructor(private readonly summaryQuery: SummaryQueryService) {}

  /** Günlük seri (`project_daily_summary`). */
  @Get('summary')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ProjectSummaryResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  forProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectSummaryQueryDto,
  ): Promise<ProjectSummaryResponseDto> {
    return this.summaryQuery.forProject(projectId, query);
  }
}
