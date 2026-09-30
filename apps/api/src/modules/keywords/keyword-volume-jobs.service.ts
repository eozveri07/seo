import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { Repository } from 'typeorm';
import { addDays } from '../../common/dates/utc-date';
import {
  keywordVolumeJobId,
  keywordVolumeManualJobId,
} from '../../infra/queue/job-ids';
import {
  JobTrigger,
  KeywordVolumeJobData,
  QueueName,
} from '../../infra/queue/queues';
import {
  DailyDispatchSource,
  DispatchItem,
} from '../dispatch/daily-dispatch-source';
import { TrackedKeyword } from './entities/tracked-keyword.entity';

/** ARCHITECTURE §5.5: hacim/CPC 30 günden eskiyse aylık güncellenir. */
export const VOLUME_STALE_AFTER_DAYS = 30;

/**
 * `keyword-volume` job'larını kuyruğa ekler: keyword eklendiğinde anında
 * (manuel tetikleme) ve `daily-dispatch` içinde ayda bir (`volume_updated_at`
 * 30 günden eski ya da hiç güncellenmemiş projeler için).
 */
@Injectable()
export class KeywordVolumeJobsService implements DailyDispatchSource {
  constructor(
    @InjectQueue(QueueName.KeywordVolume)
    private readonly queue: Queue<KeywordVolumeJobData>,
    @InjectRepository(TrackedKeyword)
    private readonly systemKeywords: Repository<TrackedKeyword>,
  ) {}

  /**
   * `daily-dispatch`: hacmi hiç güncellenmemiş ya da 30 günden eski, aktif
   * keyword'ü olan her proje için bir job (proje başına tek istek, birden
   * fazla keyword içerir).
   */
  async collect(date: string): Promise<DispatchItem[]> {
    const threshold = addDays(date, -VOLUME_STALE_AFTER_DAYS);
    const rows = await this.systemKeywords
      .createQueryBuilder('keyword')
      .select('DISTINCT keyword.org_id', 'orgId')
      .addSelect('keyword.project_id', 'projectId')
      .where('keyword.is_active = true')
      .andWhere(
        '(keyword.volume_updated_at IS NULL OR keyword.volume_updated_at < :threshold)',
        { threshold },
      )
      .getRawMany<{ orgId: string; projectId: string }>();

    return rows.map(({ orgId, projectId }) => ({
      orgId,
      projectId,
      kind: QueueName.KeywordVolume,
      enqueue: async () => {
        await this.queue.add(
          QueueName.KeywordVolume,
          { orgId, projectId, trigger: JobTrigger.Schedule },
          { jobId: keywordVolumeJobId(projectId, date) },
        );
      },
    }));
  }

  /** Keyword eklendiğinde (tekil ya da bulk) anında tetiklenir. */
  async enqueueManual(orgId: string, projectId: string): Promise<void> {
    await this.queue.add(
      QueueName.KeywordVolume,
      { orgId, projectId, trigger: JobTrigger.Manual },
      { jobId: keywordVolumeManualJobId(projectId, uuidv7()) },
    );
  }
}
