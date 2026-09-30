import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OrgRole } from '../../../common/tenancy/org-role';
import { Invitation } from '../entities/invitation.entity';
import { Membership } from '../entities/membership.entity';
import { InvitationPreview } from '../invitations.service';

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  @IsEnum(OrgRole)
  role!: OrgRole;

  /** client_viewer için zorunlu, diğer rollerde verilmez. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

/** Davet bağlantısındaki token. */
export class InvitationTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;
}

export class InvitationResponseDto {
  id!: string;
  email!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  clientId!: string | null;
  expiresAt!: Date;
  invitedBy!: string | null;
  createdAt!: Date;

  static fromEntity(invitation: Invitation): InvitationResponseDto {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      clientId: invitation.clientId,
      expiresAt: invitation.expiresAt,
      invitedBy: invitation.invitedBy,
      createdAt: invitation.createdAt,
    };
  }
}

export class CreatedInvitationResponseDto extends InvitationResponseDto {
  /** Mail gönderilemediyse false; davet geçerlidir, tekrar oluşturularak yeniden gönderilebilir. */
  emailSent!: boolean;
}

export class InvitationListResponseDto {
  items!: InvitationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class InvitationPreviewResponseDto {
  organizationName!: string;
  email!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  expiresAt!: Date;

  /** true ise kullanıcı giriş yapıp kabul eder; false ise ad ve şifreyle kayıt olur. */
  userExists!: boolean;

  static fromPreview(preview: InvitationPreview): InvitationPreviewResponseDto {
    return {
      organizationName: preview.organization.name,
      email: preview.invitation.email,
      role: preview.invitation.role,
      expiresAt: preview.invitation.expiresAt,
      userExists: preview.userExists,
    };
  }
}

export class AcceptInvitationResponseDto {
  organizationId!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  clientId!: string | null;

  static fromMembership(membership: Membership): AcceptInvitationResponseDto {
    return {
      organizationId: membership.orgId,
      role: membership.role,
      clientId: membership.clientId,
    };
  }
}
