import { WorkerModule, parseWorkerQueues } from './worker.module';
import { QueueName } from './infra/queue/queues';
import { PingProcessorModule } from './modules/ping/ping-processor.module';

describe('parseWorkerQueues', () => {
  it.each([undefined, '', '   '])(
    '%s için tanımsız döner (tüm kuyruklar kaydolur)',
    (raw) => {
      expect(parseWorkerQueues(raw)).toBeUndefined();
    },
  );

  it('virgülle ayrılmış kuyruk isimlerini trim ederek döner', () => {
    expect(parseWorkerQueues(' gsc-sync, ga4-sync ,ping ')).toEqual([
      QueueName.GscSync,
      QueueName.Ga4Sync,
      QueueName.Ping,
    ]);
  });

  it('tekil kuyruk ismini dizi olarak döner', () => {
    expect(parseWorkerQueues('ping')).toEqual([QueueName.Ping]);
  });
});

describe('WorkerModule.register', () => {
  const originalWorkerQueues = process.env.WORKER_QUEUES;

  afterEach(() => {
    if (originalWorkerQueues === undefined) {
      delete process.env.WORKER_QUEUES;
    } else {
      process.env.WORKER_QUEUES = originalWorkerQueues;
    }
  });

  it('WORKER_QUEUES boşsa ping processor modülü yüklenir', () => {
    delete process.env.WORKER_QUEUES;

    const { imports } = WorkerModule.register();

    expect(imports).toContain(PingProcessorModule);
  });

  it('WORKER_QUEUES ping içermiyorsa ping processor modülü yüklenmez', () => {
    process.env.WORKER_QUEUES = 'gsc-sync,ga4-sync';

    const { imports } = WorkerModule.register();

    expect(imports).not.toContain(PingProcessorModule);
  });

  it('WORKER_QUEUES ping içeriyorsa ping processor modülü yüklenir', () => {
    process.env.WORKER_QUEUES = 'ping';

    const { imports } = WorkerModule.register();

    expect(imports).toContain(PingProcessorModule);
  });
});
