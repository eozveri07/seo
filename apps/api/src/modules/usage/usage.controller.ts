import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { UsageReportQueryDto } from './dto/usage-query.dto';
import { UsageReportResponseDto } from './dto/usage-response.dto';
import { UsageService } from './usage.service';

/** ARCHITECTURE §5.6/§9.3: org bazlı dış API maliyet raporu; yalnız owner/admin. */
@ApiTags('usage')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  @Roles(...ROLE_MATRIX.usageView)
  @ApiOkResponse({ type: UsageReportResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_ERROR, INVALID_DATE_RANGE',
  })
  report(
    @CurrentOrg() org: TenantContext,
    @Query() query: UsageReportQueryDto,
  ): Promise<UsageReportResponseDto> {
    return this.usageService.report(org.orgId, query);
  }
}
