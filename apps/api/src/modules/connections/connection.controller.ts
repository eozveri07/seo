import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
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
import { ConnectionsService } from './connections.service';
import {
  ConnectionResponseDto,
  ServiceAccountResponseDto,
} from './dto/connection-response.dto';

/**
 * Bağlantı id'sine göre işlemler; `:connectionId` `ProjectAccessGuard`'dan
 * geçmez (path'te `:projectId` yok), bu yüzden `client_viewer` kapsamı
 * `ConnectionsService` içinde uygulanır.
 */
@ApiTags('connections')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('connections')
export class ConnectionController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  /** Kullanıcının property'ye ekleyeceği sistem service account e-postası. */
  @Get('service-account')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ServiceAccountResponseDto })
  getServiceAccount(): ServiceAccountResponseDto {
    return { email: this.connectionsService.getServiceAccountEmail() };
  }

  @Get(':connectionId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'CONNECTION_NOT_FOUND' })
  async findOne(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<ConnectionResponseDto> {
    const connection = await this.connectionsService.findOne(connectionId, org);
    return ConnectionResponseDto.fromEntity(connection);
  }

  @Post(':connectionId/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'CONNECTION_NOT_FOUND' })
  async verify(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<ConnectionResponseDto> {
    const connection = await this.connectionsService.verify(connectionId, org);
    return ConnectionResponseDto.fromEntity(connection);
  }

  @Delete(':connectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'CONNECTION_NOT_FOUND' })
  async delete(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<void> {
    await this.connectionsService.delete(connectionId, org);
  }
}
