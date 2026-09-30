import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InvalidSummaryDateRangeError } from './summary.errors';
import { ProjectSummaryCardRow, SummaryStore } from './summary-store';
import { SummaryQueryService } from './summary-query.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const CLIENT_B = '0190f0e4-0000-7000-8000-00000000000d';

interface MockSummaryStore {
  range: jest.Mock;
  cards: jest.Mock;
}

function setup() {
  const store: MockSummaryStore = {
    range: jest.fn().mockResolvedValue([]),
    cards: jest.fn().mockResolvedValue([]),
  };
  const cls = {
    get: () => ORG,
    isActive: () => true,
  } as unknown as ClsService<AppClsStore>;
  return {
    store,
    service: new SummaryQueryService(store as unknown as SummaryStore, cls),
  };
}

describe('SummaryQueryService.forProject', () => {
  it('tarih verilmezse dünden geriye 28 gün kullanır', async () => {
    const { store, service } = setup();

    const result = await service.forProject(PROJECT, {}, '2026-09-30');

    expect(result).toEqual({
      from: '2026-09-02',
      to: '2026-09-29',
      points: [],
    });
    expect(store.range).toHaveBeenCalledWith(
      ORG,
      PROJECT,
      '2026-09-02',
      '2026-09-29',
    );
  });

  it('from > to ise INVALID_DATE_RANGE fırlatır', async () => {
    const { service } = setup();

    await expect(
      service.forProject(
        PROJECT,
        { from: '2026-09-30', to: '2026-09-01' },
        '2026-10-01',
      ),
    ).rejects.toBeInstanceOf(InvalidSummaryDateRangeError);
  });
});

describe('SummaryQueryService.cards', () => {
  it('client_viewer yalnız kendi clientId siyle sorgular (query daki clientId i yok sayar)', async () => {
    const { store, service } = setup();
    const actor: TenantContext = {
      orgId: ORG,
      role: OrgRole.ClientViewer,
      clientId: CLIENT_A,
    };

    await service.cards({ clientId: CLIENT_B }, actor);

    expect(store.cards).toHaveBeenCalledWith(ORG, CLIENT_A);
  });

  it('owner/admin query deki clientId yi kullanır, verilmezse null (tüm org)', async () => {
    const { store, service } = setup();
    const actor: TenantContext = {
      orgId: ORG,
      role: OrgRole.Owner,
      clientId: null,
    };

    await service.cards({ clientId: CLIENT_B }, actor);
    expect(store.cards).toHaveBeenCalledWith(ORG, CLIENT_B);

    await service.cards({}, actor);
    expect(store.cards).toHaveBeenCalledWith(ORG, null);
  });

  it('satırları kart dto suna çevirir: 7/28 günlük değişim fark olarak hesaplanır', async () => {
    const { store, service } = setup();
    const row: ProjectSummaryCardRow = {
      projectId: PROJECT,
      projectName: 'Proje A',
      clientId: CLIENT_A,
      date: '2026-09-29',
      clicks: 100,
      organicSessions: 50,
      avgPosition: 5,
      visibilityScore: 40,
      clicksPrev7: 80,
      organicSessionsPrev7: 40,
      avgPositionPrev7: 7,
      visibilityScorePrev7: 30,
      clicksPrev28: null,
      organicSessionsPrev28: null,
      avgPositionPrev28: null,
      visibilityScorePrev28: null,
      visibilitySeries: [10, 20, 40],
    };
    store.cards.mockResolvedValue([row]);
    const actor: TenantContext = {
      orgId: ORG,
      role: OrgRole.Owner,
      clientId: null,
    };

    const result = await service.cards({}, actor);

    expect(result.items).toEqual([
      expect.objectContaining({
        projectId: PROJECT,
        clicks: { value: 100, change7d: 20, change28d: null },
        visibilityScore: { value: 40, change7d: 10, change28d: null },
        visibilitySeries: [10, 20, 40],
      }),
    ]);
  });
});
