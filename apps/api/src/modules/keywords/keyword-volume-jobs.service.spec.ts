import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { KeywordVolumeJobData } from '../../infra/queue/queues';
import { TrackedKeyword } from './entities/tracked-keyword.entity';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const TODAY = '2026-09-30';

function setup(rawRows: { orgId: string; projectId: string }[]) {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
  const systemKeywords = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const service = new KeywordVolumeJobsService(
    queue as unknown as Queue<KeywordVolumeJobData>,
    systemKeywords as unknown as Repository<TrackedKeyword>,
  );
  return { service, queryBuilder, queue };
}

describe('KeywordVolumeJobsService', () => {
  it('30 günden eski ya da hiç güncellenmemiş keyword’ü olan her proje için bir dispatch öğesi döner', async () => {
    const { service } = setup([{ orgId: ORG, projectId: PROJECT_ID }]);

    const items = await service.collect(TODAY);

    expect(items).toHaveLength(1);
    expect(items[0].orgId).toBe(ORG);
    expect(items[0].projectId).toBe(PROJECT_ID);
    expect(items[0].kind).toBe('keyword-volume');
    expect(typeof items[0].enqueue).toBe('function');
  });

  it('enqueue çağrıldığında deterministik jobId ile kuyruğa ekler', async () => {
    const { service, queue } = setup([{ orgId: ORG, projectId: PROJECT_ID }]);
    const [item] = await service.collect(TODAY);

    await item.enqueue();

    expect(queue.add).toHaveBeenCalledWith(
      'keyword-volume',
      { orgId: ORG, projectId: PROJECT_ID, trigger: 'schedule' },
      { jobId: `keyword-volume:${PROJECT_ID}:${TODAY}` },
    );
  });

  it('enqueueManual her çağrıda benzersiz bir jobId ile manuel tetikler', async () => {
    const { service, queue } = setup([]);

    await service.enqueueManual(ORG, PROJECT_ID);
    await service.enqueueManual(ORG, PROJECT_ID);

    expect(queue.add).toHaveBeenCalledTimes(2);
    const jobIds = queue.add.mock.calls.map(
      (call: unknown[]) => (call[2] as { jobId: string }).jobId,
    );
    expect(jobIds[0]).not.toBe(jobIds[1]);
    for (const jobId of jobIds) {
      expect(jobId.startsWith(`keyword-volume-manual:${PROJECT_ID}:`)).toBe(
        true,
      );
    }
  });
});
