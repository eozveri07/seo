import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';
import { Project } from '../../clients/entities/project.entity';

/**
 * Proje içinde keyword'leri gruplamaya yarar (ARCHITECTURE §5.5).
 * `(project_id, name)` unique'tir.
 */
@Entity('keyword_groups')
@Index('UQ_keyword_groups_project_id_name', ['projectId', 'name'], {
  unique: true,
})
@Index('IDX_keyword_groups_org_id_project_id', ['orgId', 'projectId'])
export class KeywordGroup extends TenantScopedEntity {
  @Column('uuid')
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  color!: string | null;
}
