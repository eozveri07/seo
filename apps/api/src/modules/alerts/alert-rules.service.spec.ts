import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditService } from '../audit-logs/audit.service';
import {
  AlertRuleNotFoundError,
  UnknownNotificationChannelError,
} from './alerts.errors';
import { InvalidAlertRuleConfigError } from './alerts.errors';
import { AlertRule, AlertRuleType } from './entities/alert-rule.entity';
import { AlertRulesService } from './alert-rules.service';
import { NotificationChannelsService } from './notification-channels.service';

const PROJECT = 'project-1';

function setup() {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const rules = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn((entity: Partial<AlertRule>) =>
      Promise.resolve({ id: 'rule-1', ...entity }),
    ),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const notificationChannels = {
    findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new AlertRulesService(
    rules as unknown as TenantRepository<AlertRule>,
    notificationChannels as unknown as NotificationChannelsService,
    audit as unknown as AuditService,
  );

  return { service, rules, notificationChannels, audit, qb };
}

describe('AlertRulesService', () => {
  it('create: config doğrulanır ve kanallar mevcut olmalı', async () => {
    const { service, rules } = setup();

    const rule = await service.create({
      projectId: PROJECT,
      name: 'Rank düşüşü',
      type: AlertRuleType.RankDrop,
      config: { minDrop: 3, fromTop: 10 },
      channels: ['channel-1'],
    });

    expect(rules.save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT,
        type: AlertRuleType.RankDrop,
        config: { minDrop: 3, fromTop: 10 },
        cooldownHours: 24,
      }),
    );
    expect(rule.id).toBe('rule-1');
  });

  it('create: bilinmeyen kanal id si UnknownNotificationChannelError fırlatır', async () => {
    const { service, notificationChannels } = setup();
    notificationChannels.findOne.mockRejectedValue(new Error('yok'));

    await expect(
      service.create({
        projectId: PROJECT,
        name: 'Rank düşüşü',
        type: AlertRuleType.RankDrop,
        config: { minDrop: 3, fromTop: 10 },
        channels: ['channel-missing'],
      }),
    ).rejects.toThrow(UnknownNotificationChannelError);
  });

  it('create: geçersiz config reddedilir', async () => {
    const { service } = setup();

    await expect(
      service.create({
        projectId: PROJECT,
        name: 'Rank düşüşü',
        type: AlertRuleType.RankDrop,
        config: {},
        channels: [],
      }),
    ).rejects.toThrow(InvalidAlertRuleConfigError);
  });

  it('findOne: bulunamazsa AlertRuleNotFoundError fırlatır', async () => {
    const { service, rules } = setup();
    rules.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(PROJECT, 'missing')).rejects.toThrow(
      AlertRuleNotFoundError,
    );
  });

  it('listActive: yalnız aktif kuralları döner', async () => {
    const { service, rules } = setup();
    rules.findBy.mockResolvedValue([{ id: 'rule-1', isActive: true }]);

    const result = await service.listActive(PROJECT);

    expect(rules.findBy).toHaveBeenCalledWith({
      projectId: PROJECT,
      isActive: true,
    });
    expect(result).toHaveLength(1);
  });
});
