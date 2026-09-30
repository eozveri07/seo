import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { AlertEventsService } from './alert-events.service';
import {
  AlertEventListResponseDto,
  AlertEventResponseDto,
} from './dto/alert-event-response.dto';
import { ListAlertEventQueryDto } from './dto/list-alert-event-query.dto';

/** Alert geçmişi (ARCHITECTURE §11). */
@ApiTags('alerts')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/alert-events')
export class AlertEventsController {
  constructor(private readonly alertEvents: AlertEventsService) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: AlertEventListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListAlertEventQueryDto,
  ): Promise<AlertEventListResponseDto> {
    const page = await this.alertEvents.list(projectId, query);
    return {
      ...page,
      items: page.items.map((item) =>
        AlertEventResponseDto.fromEntity(item, item.rule?.name ?? null),
      ),
    };
  }
}
