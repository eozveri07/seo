import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { ConnectionType } from '../connections/entities/connection.entity';
import { ConnectionActivatedEvent } from '../connections/events/connection-activated.event';
import { ConnectionActivatedListener } from './connection-activated.listener';
import { GscJobsService } from './gsc-jobs.service';

function buildListener() {
  const store = new Map<string, unknown>();
  const cls = {
    run: <T>(_options: unknown, callback: () => T): T => callback(),
    set: (key: string, value: unknown) => store.set(key, value),
  } as unknown as ClsService<AppClsStore>;
  const orgIdsSeen: unknown[] = [];
  const gscJobs = {
    startBackfill: jest.fn(() => {
      orgIdsSeen.push(store.get('orgId'));
      return Promise.resolve(null);
    }),
  };
  const listener = new ConnectionActivatedListener(
    gscJobs as unknown as GscJobsService,
    cls,
  );
  return { listener, gscJobs, orgIdsSeen };
}

describe('ConnectionActivatedListener', () => {
  it("GSC bağlantısı aktifleşince event'teki org'un kapsamında backfill başlatır", async () => {
    const { listener, gscJobs, orgIdsSeen } = buildListener();

    await listener.handle(
      new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Gsc),
    );

    expect(gscJobs.startBackfill).toHaveBeenCalledWith(
      'org-1',
      'p1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(orgIdsSeen).toEqual(['org-1']);
  });

  it('GA4 bağlantısında bir şey yapmaz', async () => {
    const { listener, gscJobs } = buildListener();

    await listener.handle(
      new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Ga4),
    );

    expect(gscJobs.startBackfill).not.toHaveBeenCalled();
  });

  it('backfill başlatılamazsa hatayı yutar (doğrulama isteği bozulmaz)', async () => {
    const { listener, gscJobs } = buildListener();
    gscJobs.startBackfill.mockRejectedValue(new Error('redis yok'));

    await expect(
      listener.handle(
        new ConnectionActivatedEvent('c1', 'org-1', 'p1', ConnectionType.Gsc),
      ),
    ).resolves.toBeUndefined();
  });
});
