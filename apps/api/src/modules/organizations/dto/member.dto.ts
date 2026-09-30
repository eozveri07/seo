import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrgRole } from '../../../common/tenancy/org-role';
import { MemberView } from '../memberships.service';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  @IsEnum(OrgRole)
  role!: OrgRole;

  /** client_viewer için zorunlu, diğer rollerde verilmez. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class MemberResponseDto {
  userId!: string;
  email!: string;
  name!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  clientId!: string | null;

  /** Üyeliğin başladığı an. */
  joinedAt!: Date;

  static fromView({ membership, user }: MemberView): MemberResponseDto {
    return {
      userId: membership.userId,
      email: user?.email ?? '',
      name: user?.name ?? '',
      role: membership.role,
      clientId: membership.clientId,
      joinedAt: membership.createdAt,
    };
  }
}

export class MemberListResponseDto {
  items!: MemberResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class MemberRoleResponseDto {
  userId!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  clientId!: string | null;
}
