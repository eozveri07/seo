import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { SyncFailedEvent } from '../../common/events/sync-failed.event';
import { QueueName } from '../../infra/queue/queues';
import { SyncFailureAlertTriggerListener } from './sync-failure-alert-trigger.listener';

function buildListener() {
  const store = new Map<string, unknown>();
  const cls = {
    run: <T>(_options: unknown, callback: () => T): T => callback(),
    set: (key: string, value: unknown) => store.set(key, value),
  } as unknown as ClsService<AppClsStore>;
  const orgIdsSeen: unknown[] = [];
  const alertEvalQueue = {
    add: jest.fn(() => {
      orgIdsSeen.push(store.get('orgId'));
      return Promise.resolve(undefined);
    }),
  };
  const listener = new SyncFailureAlertTriggerListener(
    alertEvalQueue as never,
    cls,
  );
  return { listener, alertEvalQueue, orgIdsSeen };
}

describe('SyncFailureAlertTriggerListener', () => {
  it("sync.failed'de event'in org'u kapsamında alert-eval job'u ekler", async () => {
    const { listener, alertEvalQueue, orgIdsSeen } = buildListener();

    await listener.onSyncFailed(
      new SyncFailedEvent('org-1', 'project-1', 'conn-1', 'gsc', '403'),
    );

    expect(alertEvalQueue.add).toHaveBeenCalledWith(QueueName.AlertEval, {
      orgId: 'org-1',
      projectId: 'project-1',
    });
    expect(orgIdsSeen).toEqual(['org-1']);
  });

  it('job eklenemezse hatayı yutar (event akışı bozulmaz)', async () => {
    const { listener, alertEvalQueue } = buildListener();
    alertEvalQueue.add.mockRejectedValue(new Error('redis yok'));

    await expect(
      listener.onSyncFailed(
        new SyncFailedEvent('org-1', 'project-1', 'conn-1', 'ga4', '403'),
      ),
    ).resolves.toBeUndefined();
  });
});
