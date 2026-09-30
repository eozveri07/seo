import { DailyDispatchSource, DispatchItem } from './daily-dispatch-source';
import { DispatchService } from './dispatch.service';

function item(
  orgId: string,
  projectId: string,
  order: string[],
  kind = 'gsc-sync',
): DispatchItem {
  return {
    orgId,
    projectId,
    kind,
    enqueue: jest.fn(() => {
      order.push(`${kind}:${projectId}`);
      return Promise.resolve();
    }),
  };
}

describe('DispatchService', () => {
  it("tüm kaynakların işlerini org'lara göre round-robin sırayla ekler", async () => {
    const order: string[] = [];
    const collectGsc = jest
      .fn()
      .mockResolvedValue([
        item('org-a', 'a1', order),
        item('org-a', 'a2', order),
        item('org-b', 'b1', order),
      ]);
    const gsc: DailyDispatchSource = { collect: collectGsc };
    const other: DailyDispatchSource = {
      collect: jest.fn().mockResolvedValue([item('org-c', 'c1', order, 'x')]),
    };
    const service = new DispatchService([gsc, other]);

    const stats = await service.dispatchDaily('2026-09-30');

    expect(collectGsc).toHaveBeenCalledWith('2026-09-30');
    expect(order).toEqual([
      'gsc-sync:a1',
      'gsc-sync:b1',
      'x:c1',
      'gsc-sync:a2',
    ]);
    expect(stats).toEqual({
      date: '2026-09-30',
      enqueued: 4,
      failed: 0,
      byKind: { 'gsc-sync': 3, x: 1 },
    });
  });

  it('bir iş eklenemezse diğerlerini ekler, sonunda hata fırlatır (retry)', async () => {
    const order: string[] = [];
    const failing = item('org-a', 'a1', order);
    (failing.enqueue as jest.Mock).mockRejectedValue(new Error('redis'));
    const source: DailyDispatchSource = {
      collect: jest
        .fn()
        .mockResolvedValue([failing, item('org-b', 'b1', order)]),
    };
    const service = new DispatchService([source]);

    await expect(service.dispatchDaily('2026-09-30')).rejects.toThrow(
      '1 job kuyruğa eklenemedi',
    );
    expect(order).toEqual(['gsc-sync:b1']);
  });
});
