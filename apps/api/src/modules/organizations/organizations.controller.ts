import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { OrgRole, ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { SkipTenant } from '../../common/tenancy/skip-tenant.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import {
  OrganizationResponseDto,
  UserOrganizationListResponseDto,
  UserOrganizationResponseDto,
} from './dto/organization-response.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /** Yeni organizasyon; oluşturan kullanıcı owner olur. */
  @Post()
  @SkipTenant()
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: UserOrganizationResponseDto })
  @ApiConflictResponse({ description: 'ORG_SLUG_TAKEN' })
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserOrganizationResponseDto> {
    const organization = await this.organizationsService.create(dto, user.id);
    return UserOrganizationResponseDto.fromView({
      organization,
      role: OrgRole.Owner,
      clientId: null,
    });
  }

  /** Kullanıcının üye olduğu organizasyonlar. X-Org-Id gerekmez. */
  @Get()
  @SkipTenant()
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserOrganizationListResponseDto })
  async list(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserOrganizationListResponseDto> {
    const page = await this.organizationsService.listForUser(user.id, query);
    return {
      ...page,
      items: page.items.map((item) =>
        UserOrganizationResponseDto.fromView(item),
      ),
    };
  }

  /** X-Org-Id ile seçilen organizasyon. */
  @Get('current')
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: OrganizationResponseDto })
  async getCurrent(): Promise<OrganizationResponseDto> {
    return OrganizationResponseDto.fromEntity(
      await this.organizationsService.getCurrent(),
    );
  }

  @Patch('current')
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.orgManage)
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  @ApiConflictResponse({ description: 'ORG_SLUG_TAKEN' })
  async update(
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    return OrganizationResponseDto.fromEntity(
      await this.organizationsService.update(dto),
    );
  }

  /** Organizasyonu, üyeliklerini ve davetlerini siler. */
  @Delete('current')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.orgManage)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  async delete(): Promise<void> {
    await this.organizationsService.delete();
  }
}
