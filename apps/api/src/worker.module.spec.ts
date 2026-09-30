import { DynamicModule } from '@nestjs/common';
import { WorkerModule, parseWorkerQueues } from './worker.module';
import { QueueName } from './infra/queue/queues';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { PingProcessorModule } from './modules/ping/ping-processor.module';

function includesHousekeepingModule(
  imports: DynamicModule['imports'],
): boolean {
  return (imports ?? []).some(
    (imported) =>
      typeof imported === 'object' &&
      'module' in imported &&
      imported.module === HousekeepingModule,
  );
}

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

describe('WorkerModule.register - HousekeepingModule', () => {
  const originalSchedulerEnabled = process.env.SCHEDULER_ENABLED;

  afterEach(() => {
    if (originalSchedulerEnabled === undefined) {
      delete process.env.SCHEDULER_ENABLED;
    } else {
      process.env.SCHEDULER_ENABLED = originalSchedulerEnabled;
    }
  });

  it('SCHEDULER_ENABLED=true iken HousekeepingModule yüklenir', () => {
    process.env.SCHEDULER_ENABLED = 'true';

    const { imports } = WorkerModule.register();

    expect(includesHousekeepingModule(imports)).toBe(true);
  });

  it('SCHEDULER_ENABLED tanımsızken HousekeepingModule yüklenmez', () => {
    delete process.env.SCHEDULER_ENABLED;

    const { imports } = WorkerModule.register();

    expect(includesHousekeepingModule(imports)).toBe(false);
  });

  it('SCHEDULER_ENABLED=false iken HousekeepingModule yüklenmez', () => {
    process.env.SCHEDULER_ENABLED = 'false';

    const { imports } = WorkerModule.register();

    expect(includesHousekeepingModule(imports)).toBe(false);
  });
});
