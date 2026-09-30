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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import {
  ClientListResponseDto,
  ClientResponseDto,
} from './dto/client-response.dto';
import { ListClientQueryDto } from './dto/list-client-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

/** Aktif organizasyonun (X-Org-Id) müşterileri. */
@ApiTags('clients')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  /** `client_viewer` yalnız kendi client'ını görür. */
  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ClientListResponseDto })
  async list(
    @Query() query: ListClientQueryDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<ClientListResponseDto> {
    const page = await this.clientsService.list(query, org);
    return {
      ...page,
      items: page.items.map((item) => ClientResponseDto.fromEntity(item)),
    };
  }

  @Get(':clientId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'CLIENT_NOT_FOUND' })
  async findOne(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<ClientResponseDto> {
    const client = await this.clientsService.findOne(clientId, org);
    return ClientResponseDto.fromEntity(client);
  }

  @Post()
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiCreatedResponse({ type: ClientResponseDto })
  async create(@Body() dto: CreateClientDto): Promise<ClientResponseDto> {
    const client = await this.clientsService.create(dto);
    return ClientResponseDto.fromEntity(client);
  }

  @Patch(':clientId')
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'CLIENT_NOT_FOUND' })
  async update(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    const client = await this.clientsService.update(clientId, dto);
    return ClientResponseDto.fromEntity(client);
  }

  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.clientProjectManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'CLIENT_NOT_FOUND' })
  async delete(
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<void> {
    await this.clientsService.delete(clientId);
  }
}
