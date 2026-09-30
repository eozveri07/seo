import {
  TrackedKeyword,
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from '../entities/tracked-keyword.entity';

export class TrackedKeywordResponseDto {
  id!: string;
  projectId!: string;
  groupId!: string | null;
  keyword!: string;
  keywordNormalized!: string;
  device!: TrackedKeywordDevice;
  locationCode!: number;
  languageCode!: string;
  frequency!: TrackedKeywordFrequency;
  depth!: number;
  targetUrl!: string | null;
  tags!: string[];
  isActive!: boolean;
  searchVolume!: number | null;
  cpc!: number | null;
  volumeUpdatedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(keyword: TrackedKeyword): TrackedKeywordResponseDto {
    return {
      id: keyword.id,
      projectId: keyword.projectId,
      groupId: keyword.groupId,
      keyword: keyword.keyword,
      keywordNormalized: keyword.keywordNormalized,
      device: keyword.device,
      locationCode: keyword.locationCode,
      languageCode: keyword.languageCode,
      frequency: keyword.frequency,
      depth: keyword.depth,
      targetUrl: keyword.targetUrl,
      tags: keyword.tags,
      isActive: keyword.isActive,
      searchVolume: keyword.searchVolume,
      cpc: keyword.cpc !== null ? Number(keyword.cpc) : null,
      volumeUpdatedAt: keyword.volumeUpdatedAt,
      createdAt: keyword.createdAt,
      updatedAt: keyword.updatedAt,
    };
  }
}

export class TrackedKeywordListResponseDto {
  items!: TrackedKeywordResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
