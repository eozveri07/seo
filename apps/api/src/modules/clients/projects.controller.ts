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
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { ProjectSummaryCardsQueryDto } from '../summary/dto/summary-query.dto';
import { ProjectSummaryCardsResponseDto } from '../summary/dto/summary-response.dto';
import { SummaryQueryService } from '../summary/summary-query.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectQueryDto } from './dto/list-project-query.dto';
import {
  ProjectListResponseDto,
  ProjectResponseDto,
} from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/**
 * Aktif organizasyonun (X-Org-Id) projeleri. `:projectId` içeren endpoint'ler
 * `ProjectAccessGuard`'dan geçer (org ve client_viewer scope kontrolü).
 *
 * `GET /projects/summary` (T1.10, org genelindeki proje kartları) bu
 * controller'da, `findOne(':projectId')`'dan ÖNCE tanımlıdır: aksi halde
 * Express router `/projects/summary`'yi `projectId = 'summary'` olarak
 * `:projectId` route'una eşler (`ParseUUIDPipe` 400 döndürür, asla bu
 * handler'a ulaşmaz). İş mantığı `summary` modülünün `SummaryQueryService`'inde.
 */
@ApiTags('projects')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly summaryQuery: SummaryQueryService,
  ) {}

  /** `client_viewer` yalnız kendi client'ının projelerini görür. */
  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ProjectListResponseDto })
  async list(
    @Query() query: ListProjectQueryDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<ProjectListResponseDto> {
    const page = await this.projectsService.list(query, org);
    return {
      ...page,
      items: page.items.map((item) => ProjectResponseDto.fromEntity(item)),
    };
  }

  /**
   * Org genelindeki proje kartları (ARCHITECTURE §10, T1.12): son değerler,
   * 7/28 günlük değişim, mini seri. Tek sorguyla (`SummaryStore.cards`),
   * `client_viewer` yalnız kendi client'ını görür.
   */
  @Get('summary')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ProjectSummaryCardsResponseDto })
  cards(
    @Query() query: ProjectSummaryCardsQueryDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<ProjectSummaryCardsResponseDto> {
    return this.summaryQuery.cards(query, org);
  }

  @Get(':projectId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findOne(projectId);
    return ProjectResponseDto.fromEntity(project);
  }

  @Post()
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiConflictResponse({ description: 'PROJECT_DOMAIN_TAKEN' })
  async create(@Body() dto: CreateProjectDto): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create(dto);
    return ProjectResponseDto.fromEntity(project);
  }

  @Patch(':projectId')
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PROJECT_DOMAIN_TAKEN' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update(projectId, dto);
    return ProjectResponseDto.fromEntity(project);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.projectsService.delete(projectId);
  }
}
