import { Injectable } from '@nestjs/common';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AlertEvent } from './entities/alert-event.entity';
import { ListAlertEventQueryDto } from './dto/list-alert-event-query.dto';

/** Alert geçmişi (`GET /projects/:id/alert-events`, ARCHITECTURE §11). */
@Injectable()
export class AlertEventsService {
  constructor(
    @InjectTenantRepository(AlertEvent)
    private readonly events: TenantRepository<AlertEvent>,
  ) {}

  async list(
    projectId: string,
    query: ListAlertEventQueryDto,
  ): Promise<Page<AlertEvent>> {
    const qb = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.rule', 'rule')
      .andWhere('event.project_id = :projectId', { projectId })
      .orderBy('event.triggered_at', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.ruleId) {
      qb.andWhere('event.rule_id = :ruleId', { ruleId: query.ruleId });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }
}
