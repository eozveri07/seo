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
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import {
  MemberListResponseDto,
  MemberResponseDto,
  MemberRoleResponseDto,
  UpdateMemberRoleDto,
} from './dto/member.dto';
import { MembershipsService } from './memberships.service';

/** Aktif organizasyonun (X-Org-Id) üyeleri. */
@ApiTags('members')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('members')
export class MembersController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @Roles(...ROLE_MATRIX.memberManage)
  @ApiOkResponse({ type: MemberListResponseDto })
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<MemberListResponseDto> {
    const page = await this.membershipsService.list(query);
    return {
      ...page,
      items: page.items.map((item) => MemberResponseDto.fromView(item)),
    };
  }

  /** Rol değiştirir. owner rolünü yalnız owner verir ya da alır; son owner düşürülemez. */
  @Patch(':userId')
  @Roles(...ROLE_MATRIX.memberManage)
  @ApiOkResponse({ type: MemberRoleResponseDto })
  @ApiNotFoundResponse({ description: 'MEMBER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'LAST_OWNER' })
  async changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<MemberRoleResponseDto> {
    const membership = await this.membershipsService.changeRole(
      userId,
      dto,
      org,
    );
    return {
      userId: membership.userId,
      role: membership.role,
      clientId: membership.clientId,
    };
  }

  /** Üyeyi çıkarır; son owner çıkarılamaz. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.orgManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'MEMBER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'LAST_OWNER' })
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<void> {
    await this.membershipsService.remove(userId, org);
  }
}
