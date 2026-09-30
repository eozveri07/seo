import { DynamicModule } from '@nestjs/common';
import { WorkerModule, parseWorkerQueues } from './worker.module';
import { QueueName } from './infra/queue/queues';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { DispatchProcessorModule } from './modules/dispatch/dispatch-processor.module';
import {
  GscBackfillProcessorModule,
  GscSyncProcessorModule,
} from './modules/gsc/gsc-processor.module';

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
    expect(parseWorkerQueues(' gsc-sync, ga4-sync ,dispatch ')).toEqual([
      QueueName.GscSync,
      QueueName.Ga4Sync,
      QueueName.Dispatch,
    ]);
  });

  it('tekil kuyruk ismini dizi olarak döner', () => {
    expect(parseWorkerQueues('dispatch')).toEqual([QueueName.Dispatch]);
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

  it('WORKER_QUEUES boşsa tüm processor modülleri yüklenir', () => {
    delete process.env.WORKER_QUEUES;

    const { imports } = WorkerModule.register();

    expect(imports).toEqual(
      expect.arrayContaining([
        DispatchProcessorModule,
        GscSyncProcessorModule,
        GscBackfillProcessorModule,
      ]),
    );
  });

  it('WORKER_QUEUES yalnız listelenen kuyrukların processor modüllerini yükler', () => {
    process.env.WORKER_QUEUES = 'gsc-sync,ga4-sync';

    const { imports } = WorkerModule.register();

    expect(imports).toContain(GscSyncProcessorModule);
    expect(imports).not.toContain(GscBackfillProcessorModule);
    expect(imports).not.toContain(DispatchProcessorModule);
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
