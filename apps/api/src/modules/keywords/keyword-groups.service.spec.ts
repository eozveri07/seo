import { QueryFailedError } from 'typeorm';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditService } from '../audit-logs/audit.service';
import { KeywordGroup } from './entities/keyword-group.entity';
import { KeywordGroupsService } from './keyword-groups.service';
import {
  KeywordGroupNameTakenError,
  KeywordGroupNotFoundError,
} from './keywords.errors';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function setup() {
  const rows: KeywordGroup[] = [];
  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(() =>
      Promise.resolve([
        rows.filter((r) => r.projectId === PROJECT_ID),
        rows.length,
      ]),
    ),
  };
  const groups = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOneBy: jest.fn((where: Partial<KeywordGroup>) =>
      Promise.resolve(
        rows.find(
          (row) => row.id === where.id && row.projectId === where.projectId,
        ) ?? null,
      ),
    ),
    save: jest.fn((entity: Partial<KeywordGroup>) => {
      if (
        rows.some(
          (row) =>
            row.projectId === entity.projectId && row.name === entity.name,
        )
      ) {
        return Promise.reject(
          new QueryFailedError('insert', [], {
            constraint: 'UQ_keyword_groups_project_id_name',
          } as unknown as Error),
        );
      }
      const row = {
        ...entity,
        id: `group-${rows.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as KeywordGroup;
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
    delete: jest.fn((where: { id: string }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve({ affected: 1 });
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new KeywordGroupsService(
    groups as unknown as TenantRepository<KeywordGroup>,
    audit as unknown as AuditService,
  );
  return { service, groups, audit };
}

describe('KeywordGroupsService', () => {
  it('bir grup oluşturur ve audit kaydı bırakır', async () => {
    const { service, audit } = setup();

    const group = await service.create({ projectId: PROJECT_ID, name: 'Ana' });

    expect(group.name).toBe('Ana');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'keyword_group.created' }),
    );
  });

  it('aynı projede aynı isimde ikinci grup KEYWORD_GROUP_NAME_TAKEN fırlatır', async () => {
    const { service } = setup();
    await service.create({ projectId: PROJECT_ID, name: 'Ana' });

    await expect(
      service.create({ projectId: PROJECT_ID, name: 'Ana' }),
    ).rejects.toBeInstanceOf(KeywordGroupNameTakenError);
  });

  it('olmayan grup KEYWORD_GROUP_NOT_FOUND fırlatır', async () => {
    const { service } = setup();

    await expect(service.findOne(PROJECT_ID, 'missing')).rejects.toBeInstanceOf(
      KeywordGroupNotFoundError,
    );
  });

  it('silme audit kaydı bırakır ve satırı kaldırır', async () => {
    const { service, groups, audit } = setup();
    const group = await service.create({ projectId: PROJECT_ID, name: 'Ana' });

    await service.delete(PROJECT_ID, group.id);

    expect(groups.delete).toHaveBeenCalledWith({ id: group.id });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'keyword_group.deleted' }),
    );
  });
});
