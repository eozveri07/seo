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
import { BulkAddKeywordsResponseDto } from './dto/bulk-add-keywords-response.dto';
import { BulkAddKeywordsDto } from './dto/bulk-add-keywords.dto';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { KeywordSuggestionsQueryDto } from './dto/keyword-suggestions-query.dto';
import { KeywordSuggestionsResponseDto } from './dto/keyword-suggestion-response.dto';
import { ListTrackedKeywordQueryDto } from './dto/list-tracked-keyword-query.dto';
import {
  TrackedKeywordListResponseDto,
  TrackedKeywordResponseDto,
} from './dto/tracked-keyword-response.dto';
import { UpdateTrackedKeywordDto } from './dto/update-tracked-keyword.dto';
import { KeywordSuggestionsService } from './keyword-suggestions.service';
import { KeywordsBulkService } from './keywords-bulk.service';
import { TrackedKeywordsService } from './tracked-keywords.service';

/** Proje içindeki takip edilen keyword'ler (ARCHITECTURE §5.5). */
@ApiTags('keywords')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/keywords')
export class TrackedKeywordsController {
  constructor(
    private readonly trackedKeywords: TrackedKeywordsService,
    private readonly keywordsBulk: KeywordsBulkService,
    private readonly keywordSuggestions: KeywordSuggestionsService,
  ) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: TrackedKeywordListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListTrackedKeywordQueryDto,
  ): Promise<TrackedKeywordListResponseDto> {
    const page = await this.trackedKeywords.list(projectId, query);
    return {
      ...page,
      items: page.items.map((item) =>
        TrackedKeywordResponseDto.fromEntity(item),
      ),
    };
  }

  /** Son 28 günde gösterimi yüksek, takipte olmayan GSC sorguları. */
  @Get('suggestions')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: KeywordSuggestionsResponseDto })
  suggestions(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: KeywordSuggestionsQueryDto,
  ): Promise<KeywordSuggestionsResponseDto> {
    return this.keywordSuggestions.suggestions(projectId, query);
  }

  /** Satır satır metin ya da CSV; tek transaction, satır numaralı rapor döner. */
  @Post('bulk')
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: BulkAddKeywordsResponseDto })
  @ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
  bulkAdd(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: BulkAddKeywordsDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<BulkAddKeywordsResponseDto> {
    return this.keywordsBulk.bulkAdd(org.orgId, projectId, dto);
  }

  @Get(':keywordId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: TrackedKeywordResponseDto })
  @ApiNotFoundResponse({ description: 'TRACKED_KEYWORD_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keywordId', ParseUUIDPipe) keywordId: string,
  ): Promise<TrackedKeywordResponseDto> {
    const keyword = await this.trackedKeywords.findOne(projectId, keywordId);
    return TrackedKeywordResponseDto.fromEntity(keyword);
  }

  @Post()
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: TrackedKeywordResponseDto })
  @ApiNotFoundResponse({
    description: 'PROJECT_NOT_FOUND, KEYWORD_GROUP_NOT_FOUND',
  })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTrackedKeywordDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<TrackedKeywordResponseDto> {
    const keyword = await this.trackedKeywords.create(org.orgId, {
      projectId,
      ...dto,
    });
    return TrackedKeywordResponseDto.fromEntity(keyword);
  }

  @Patch(':keywordId')
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiOkResponse({ type: TrackedKeywordResponseDto })
  @ApiNotFoundResponse({ description: 'TRACKED_KEYWORD_NOT_FOUND' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keywordId', ParseUUIDPipe) keywordId: string,
    @Body() dto: UpdateTrackedKeywordDto,
  ): Promise<TrackedKeywordResponseDto> {
    const keyword = await this.trackedKeywords.update(
      projectId,
      keywordId,
      dto,
    );
    return TrackedKeywordResponseDto.fromEntity(keyword);
  }

  @Delete(':keywordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'TRACKED_KEYWORD_NOT_FOUND' })
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('keywordId', ParseUUIDPipe) keywordId: string,
  ): Promise<void> {
    await this.trackedKeywords.delete(projectId, keywordId);
  }
}
