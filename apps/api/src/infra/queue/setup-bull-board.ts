import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { ALL_QUEUE_NAMES } from './queues';

/**
 * ARCHITECTURE §7: bull-board yalnızca development'ta, API process'inde
 * `/admin/queues` altında açılır.
 */
export function setupBullBoard(app: INestApplication): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = ALL_QUEUE_NAMES.map(
    (name) => new BullMQAdapter(app.get<Queue>(getQueueToken(name))),
  );

  createBullBoard({ queues, serverAdapter });

  app.use('/admin/queues', serverAdapter.getRouter());
}
