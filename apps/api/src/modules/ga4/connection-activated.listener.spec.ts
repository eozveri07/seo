import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { ConnectionType } from '../connections/entities/connection.entity';
import { ConnectionActivatedEvent } from '../connections/events/connection-activated.event';
import { ConnectionActivatedListener } from './connection-activated.listener';
import { Ga4JobsService } from './ga4-jobs.service';

function buildListener() {
  const store = new Map<string, unknown>();
  const cls = {
    run: <T>(_options: unknown, callback: () => T): T => callback(),
    set: (key: string, value: unknown) => store.set(key, value),
  } as unknown as ClsService<AppClsStore>;
  const orgIdsSeen: unknown[] = [];
  const ga4Jobs = {
    startBackfill: jest.fn(() => {
      orgIdsSeen.push(store.get('orgId'));
      return Promise.resolve(null);
    }),
  };
  const listener = new ConnectionActivatedListener(
    ga4Jobs as unknown as Ga4JobsService,
    cls,
  );
  return { listener, ga4Jobs, orgIdsSeen };
}

describe('ConnectionActivatedListener (GA4)', () => {
  it("GA4 bağlantısı aktifleşince event'teki org'un kapsamında backfill başlatır", async () => {
    const { listener, ga4Jobs, orgIdsSeen } = buildListener();

    await listener.handle(
      new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Ga4),
    );

    expect(ga4Jobs.startBackfill).toHaveBeenCalledWith(
      'org-1',
      'p1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(orgIdsSeen).toEqual(['org-1']);
  });

  it('GSC bağlantısında bir şey yapmaz', async () => {
    const { listener, ga4Jobs } = buildListener();

    await listener.handle(
      new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Gsc),
    );

    expect(ga4Jobs.startBackfill).not.toHaveBeenCalled();
  });

  it('backfill başlatılamazsa hatayı yutar (doğrulama isteği bozulmaz)', async () => {
    const { listener, ga4Jobs } = buildListener();
    ga4Jobs.startBackfill.mockRejectedValue(new Error('redis yok'));

    await expect(
      listener.handle(
        new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Ga4),
      ),
    ).resolves.toBeUndefined();
  });
});
