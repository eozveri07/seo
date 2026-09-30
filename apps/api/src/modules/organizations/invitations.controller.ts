import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { SkipTenant } from '../../common/tenancy/skip-tenant.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import {
  AcceptInvitationResponseDto,
  CreatedInvitationResponseDto,
  CreateInvitationDto,
  InvitationListResponseDto,
  InvitationPreviewResponseDto,
  InvitationResponseDto,
  InvitationTokenDto,
} from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  /** Aktif organizasyona davet; bağlantı mail ile gider. */
  @Post()
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.memberManage)
  @ApiCreatedResponse({ type: CreatedInvitationResponseDto })
  @ApiForbiddenResponse({
    description: 'INSUFFICIENT_ROLE, OWNER_ROLE_REQUIRED',
  })
  @ApiConflictResponse({ description: 'ALREADY_MEMBER' })
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<CreatedInvitationResponseDto> {
    const { invitation, emailSent } = await this.invitationsService.create(
      dto,
      org,
    );
    return { ...InvitationResponseDto.fromEntity(invitation), emailSent };
  }

  /** Aktif organizasyonun kabul edilmemiş davetleri. */
  @Get()
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.memberManage)
  @ApiOkResponse({ type: InvitationListResponseDto })
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<InvitationListResponseDto> {
    const page = await this.invitationsService.listPending(query);
    return {
      ...page,
      items: page.items.map((item) => InvitationResponseDto.fromEntity(item)),
    };
  }

  /** Bekleyen daveti geri çeker. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOrgScoped()
  @Roles(...ROLE_MATRIX.memberManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'INVITATION_NOT_FOUND' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrg() org: TenantContext,
  ): Promise<void> {
    await this.invitationsService.revoke(id, org);
  }

  /** Kabul ekranı için davetin özeti. Oturum gerekmez; token yetki belgesidir. */
  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InvitationPreviewResponseDto })
  @ApiNotFoundResponse({ description: 'INVITATION_NOT_FOUND' })
  @ApiGoneResponse({ description: 'INVITATION_EXPIRED' })
  @ApiConflictResponse({ description: 'INVITATION_ALREADY_ACCEPTED' })
  async preview(
    @Body() dto: InvitationTokenDto,
  ): Promise<InvitationPreviewResponseDto> {
    return InvitationPreviewResponseDto.fromPreview(
      await this.invitationsService.preview(dto.token),
    );
  }

  /**
   * Oturumdaki mevcut kullanıcı daveti kabul eder. Hesabı olmayanlar
   * `POST /auth/register-invited` ile kayıt olur.
   */
  @Post('accept')
  @SkipTenant()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AcceptInvitationResponseDto })
  @ApiNotFoundResponse({ description: 'INVITATION_NOT_FOUND' })
  @ApiGoneResponse({ description: 'INVITATION_EXPIRED' })
  @ApiConflictResponse({
    description: 'INVITATION_ALREADY_ACCEPTED, ALREADY_MEMBER',
  })
  @ApiForbiddenResponse({ description: 'INVITATION_EMAIL_MISMATCH' })
  async accept(
    @Body() dto: InvitationTokenDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AcceptInvitationResponseDto> {
    const { membership } = await this.invitationsService.accept(
      dto.token,
      user.id,
    );
    return AcceptInvitationResponseDto.fromMembership(membership);
  }
}
