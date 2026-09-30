import { ApiProperty } from '@nestjs/swagger';
import { Project, ProjectStatus } from '../entities/project.entity';

export class ProjectResponseDto {
  id!: string;
  clientId!: string;
  name!: string;
  domain!: string;
  countryCode!: string | null;
  languageCode!: string | null;
  dfsLocationCode!: number | null;
  dfsLanguageCode!: string | null;
  timezone!: string | null;

  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' })
  status!: ProjectStatus;

  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(project: Project): ProjectResponseDto {
    return {
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      domain: project.domain,
      countryCode: project.countryCode,
      languageCode: project.languageCode,
      dfsLocationCode: project.dfsLocationCode,
      dfsLanguageCode: project.dfsLanguageCode,
      timezone: project.timezone,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}

export class ProjectListResponseDto {
  items!: ProjectResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
