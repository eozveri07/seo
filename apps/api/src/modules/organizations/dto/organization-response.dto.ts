import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '../../../common/tenancy/org-role';
import { Organization } from '../entities/organization.entity';
import { UserOrganization } from '../organizations.service';
import { OrganizationSettingsDto } from './organization-settings.dto';

export class OrganizationResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  settings!: OrganizationSettingsDto;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(organization: Organization): OrganizationResponseDto {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      settings: organization.settings,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }
}

/** Kullanıcının üye olduğu bir organizasyon ve oradaki rolü. */
export class UserOrganizationResponseDto {
  id!: string;
  name!: string;
  slug!: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role!: OrgRole;

  /** client_viewer ise görebildiği client. */
  clientId!: string | null;

  static fromView(view: UserOrganization): UserOrganizationResponseDto {
    return {
      id: view.organization.id,
      name: view.organization.name,
      slug: view.organization.slug,
      role: view.role,
      clientId: view.clientId,
    };
  }
}

export class UserOrganizationListResponseDto {
  items!: UserOrganizationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
