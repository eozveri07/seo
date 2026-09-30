import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { ConnectionsService } from './connections.service';
import {
  ConnectionListResponseDto,
  ConnectionResponseDto,
  GscSiteListResponseDto,
} from './dto/connection-response.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';

/**
 * Proje kapsamlı bağlantı endpoint'leri; `:projectId` `ProjectAccessGuard`'dan
 * geçer (org ve client_viewer scope kontrolü).
 */
@ApiTags('connections')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('projects/:projectId/connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ConnectionListResponseDto })
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ConnectionListResponseDto> {
    const items = await this.connectionsService.listByProject(projectId);
    return {
      items: items.map((item) => ConnectionResponseDto.fromEntity(item)),
    };
  }

  @Post()
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiCreatedResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CONNECTION_TYPE_TAKEN' })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    const connection = await this.connectionsService.create({
      projectId,
      type: dto.type,
      externalId: dto.externalId,
    });
    return ConnectionResponseDto.fromEntity(connection);
  }

  /** Kullanıcı elle yazmak yerine service account'un erişebildiği GSC property'lerinden seçsin. */
  @Get('gsc/sites')
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiParam({ name: 'projectId', type: String })
  @ApiOkResponse({ type: GscSiteListResponseDto })
  @ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
  async listGscSites(): Promise<GscSiteListResponseDto> {
    const items = await this.connectionsService.listGscSites();
    return { items };
  }
}
