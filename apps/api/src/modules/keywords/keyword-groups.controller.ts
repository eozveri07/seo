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
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { CreateKeywordGroupDto } from './dto/create-keyword-group.dto';
import {
  KeywordGroupListResponseDto,
  KeywordGroupResponseDto,
} from './dto/keyword-group-response.dto';
import { ListKeywordGroupQueryDto } from './dto/list-keyword-group-query.dto';
import { UpdateKeywordGroupDto } from './dto/update-keyword-group.dto';
import { KeywordGroupsService } from './keyword-groups.service';

/** Proje içindeki keyword grupları (ARCHITECTURE §5.5). */
@ApiTags('keywords')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/keyword-groups')
export class KeywordGroupsController {
  constructor(private readonly keywordGroups: KeywordGroupsService) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: KeywordGroupListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListKeywordGroupQueryDto,
  ): Promise<KeywordGroupListResponseDto> {
    const page = await this.keywordGroups.list(projectId, query);
    return {
      ...page,
      items: page.items.map((item) => KeywordGroupResponseDto.fromEntity(item)),
    };
  }

  @Get(':groupId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: KeywordGroupResponseDto })
  @ApiNotFoundResponse({ description: 'KEYWORD_GROUP_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<KeywordGroupResponseDto> {
    const group = await this.keywordGroups.findOne(projectId, groupId);
    return KeywordGroupResponseDto.fromEntity(group);
  }

  @Post()
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: KeywordGroupResponseDto })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateKeywordGroupDto,
  ): Promise<KeywordGroupResponseDto> {
    const group = await this.keywordGroups.create({ projectId, ...dto });
    return KeywordGroupResponseDto.fromEntity(group);
  }

  @Patch(':groupId')
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiOkResponse({ type: KeywordGroupResponseDto })
  @ApiNotFoundResponse({ description: 'KEYWORD_GROUP_NOT_FOUND' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateKeywordGroupDto,
  ): Promise<KeywordGroupResponseDto> {
    const group = await this.keywordGroups.update(projectId, groupId, dto);
    return KeywordGroupResponseDto.fromEntity(group);
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'KEYWORD_GROUP_NOT_FOUND' })
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.keywordGroups.delete(projectId, groupId);
  }
}
