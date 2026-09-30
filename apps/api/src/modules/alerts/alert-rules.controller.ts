import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { ROLE_MATRIX } from '../../common/tenancy/org-role';
import { Roles } from '../../common/tenancy/roles.decorator';
import { AlertRulesService } from './alert-rules.service';
import {
  AlertRuleListResponseDto,
  AlertRuleResponseDto,
} from './dto/alert-rule-response.dto';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { ListAlertRuleQueryDto } from './dto/list-alert-rule-query.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

/** Proje içindeki alert kuralları (ARCHITECTURE §5.7, §11). */
@ApiTags('alerts')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@ApiNotFoundResponse({ description: 'PROJECT_NOT_FOUND' })
@Controller('projects/:projectId/alert-rules')
export class AlertRulesController {
  constructor(private readonly alertRules: AlertRulesService) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: AlertRuleListResponseDto })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListAlertRuleQueryDto,
  ): Promise<AlertRuleListResponseDto> {
    const page = await this.alertRules.list(projectId, query);
    return {
      ...page,
      items: page.items.map((item) => AlertRuleResponseDto.fromEntity(item)),
    };
  }

  @Get(':ruleId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: AlertRuleResponseDto })
  @ApiNotFoundResponse({ description: 'ALERT_RULE_NOT_FOUND' })
  async findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ): Promise<AlertRuleResponseDto> {
    const rule = await this.alertRules.findOne(projectId, ruleId);
    return AlertRuleResponseDto.fromEntity(rule);
  }

  @Post()
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiCreatedResponse({ type: AlertRuleResponseDto })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateAlertRuleDto,
  ): Promise<AlertRuleResponseDto> {
    const rule = await this.alertRules.create({ projectId, ...dto });
    return AlertRuleResponseDto.fromEntity(rule);
  }

  @Patch(':ruleId')
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiOkResponse({ type: AlertRuleResponseDto })
  @ApiNotFoundResponse({ description: 'ALERT_RULE_NOT_FOUND' })
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleResponseDto> {
    const rule = await this.alertRules.update(projectId, ruleId, dto);
    return AlertRuleResponseDto.fromEntity(rule);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.contentManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'ALERT_RULE_NOT_FOUND' })
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ): Promise<void> {
    await this.alertRules.delete(projectId, ruleId);
  }
}
