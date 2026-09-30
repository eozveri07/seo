import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Project } from '../../clients/entities/project.entity';
import { KeywordGroup } from './keyword-group.entity';

export enum TrackedKeywordDevice {
  Desktop = 'desktop',
  Mobile = 'mobile',
}

export enum TrackedKeywordFrequency {
  Daily = 'daily',
  Weekly = 'weekly',
}

/** ARCHITECTURE §5.5: keyword başına rank tracking varsayılan derinliği. */
export const DEFAULT_TRACKED_KEYWORD_DEPTH = 20;

/**
 * Takip edilen keyword (ARCHITECTURE §5.5). Unique
 * `(project_id, keyword_normalized, device, location_code, language_code)`;
 * `keyword_normalized` `normalizeKeyword` ile üretilir.
 */
@Entity('tracked_keywords')
@Index(
  'UQ_tracked_keywords_project_id_normalized_device_location_language',
  ['projectId', 'keywordNormalized', 'device', 'locationCode', 'languageCode'],
  { unique: true },
)
@Index('IDX_tracked_keywords_org_id_project_id', ['orgId', 'projectId'])
@Index('IDX_tracked_keywords_group_id', ['groupId'])
@Index('IDX_tracked_keywords_volume_updated_at', ['volumeUpdatedAt'])
export class TrackedKeyword extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column('uuid', { nullable: true })
  groupId!: string | null;

  @ManyToOne(() => KeywordGroup, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group?: KeywordGroup | null;

  @Column('text')
  keyword!: string;

  @Column('text')
  keywordNormalized!: string;

  @Column({
    type: 'enum',
    enum: TrackedKeywordDevice,
    enumName: 'tracked_keyword_device',
    default: TrackedKeywordDevice.Desktop,
  })
  device!: TrackedKeywordDevice;

  @Column('integer')
  locationCode!: number;

  @Column('text')
  languageCode!: string;

  @Column({
    type: 'enum',
    enum: TrackedKeywordFrequency,
    enumName: 'tracked_keyword_frequency',
    default: TrackedKeywordFrequency.Daily,
  })
  frequency!: TrackedKeywordFrequency;

  @Column('smallint', { default: DEFAULT_TRACKED_KEYWORD_DEPTH })
  depth!: number;

  @Column('text', { nullable: true })
  targetUrl!: string | null;

  @Column('text', { array: true, default: '{}' })
  tags!: string[];

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('integer', { nullable: true })
  searchVolume!: number | null;

  /** numeric(10,2); pg string döner. */
  @Column('numeric', { precision: 10, scale: 2, nullable: true })
  cpc!: string | null;

  @Column('timestamptz', { nullable: true })
  volumeUpdatedAt!: Date | null;
}
