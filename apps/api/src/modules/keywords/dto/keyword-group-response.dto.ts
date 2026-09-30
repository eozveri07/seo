import { KeywordGroup } from '../entities/keyword-group.entity';

export class KeywordGroupResponseDto {
  id!: string;
  projectId!: string;
  name!: string;
  color!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(group: KeywordGroup): KeywordGroupResponseDto {
    return {
      id: group.id,
      projectId: group.projectId,
      name: group.name,
      color: group.color,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}

export class KeywordGroupListResponseDto {
  items!: KeywordGroupResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
