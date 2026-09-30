import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import {
  Environment,
  EnvironmentVariables,
} from '../../config/environment-variables';
import { PingJobData } from '../../infra/queue/queues';
import { OrgRole } from '../../common/tenancy/org-role';
import { PingController } from './ping.controller';

const ORG = { orgId: 'org-1', role: OrgRole.Owner, clientId: null };

function buildQueue() {
  const add = jest.fn(
    (...args: [string, PingJobData, JobsOptions]): Promise<{ id: string }> => {
      void args;
      return Promise.resolve({ id: 'ping:job-1' });
    },
  );
  const queue = { add } as unknown as Queue<PingJobData>;
  return { queue, add };
}

function buildConfigService(
  nodeEnv: Environment,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn().mockReturnValue(nodeEnv),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe('PingController', () => {
  it('development dışında NotFoundException fırlatır', async () => {
    const { queue, add } = buildQueue();
    const controller = new PingController(
      queue,
      buildConfigService(Environment.Production),
    );

    await expect(controller.enqueue({}, ORG)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("development'ta kuyruğa X-Org-Id'deki org ile job ekler", async () => {
    const { queue, add } = buildQueue();
    const controller = new PingController(
      queue,
      buildConfigService(Environment.Development),
    );

    const result = await controller.enqueue({ message: 'merhaba' }, ORG);

    expect(result.jobId).toBe('ping:job-1');
    expect(add).toHaveBeenCalledTimes(1);
    const [queueEntryName, jobData, jobOptions] = add.mock.calls[0];
    expect(queueEntryName).toBe('ping');
    expect(jobData).toEqual({ orgId: 'org-1', message: 'merhaba' });
    expect(jobOptions.jobId?.startsWith('ping:')).toBe(true);
  });
});
