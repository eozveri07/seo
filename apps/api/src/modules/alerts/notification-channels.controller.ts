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
import { CryptoService } from '../../infra/crypto/crypto.service';
import { CreateNotificationChannelDto } from './dto/create-notification-channel.dto';
import {
  NotificationChannelListResponseDto,
  NotificationChannelResponseDto,
} from './dto/notification-channel-response.dto';
import { UpdateNotificationChannelDto } from './dto/update-notification-channel.dto';
import { NotificationChannelsService } from './notification-channels.service';

/** Org seviyesinde bildirim kanalları (ARCHITECTURE §5.7, §11). */
@ApiTags('alerts')
@ApiOrgScoped()
@ApiForbiddenResponse({ description: 'ORG_ACCESS_DENIED, INSUFFICIENT_ROLE' })
@Controller('notification-channels')
export class NotificationChannelsController {
  constructor(
    private readonly channels: NotificationChannelsService,
    private readonly crypto: CryptoService,
  ) {}

  @Get()
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: NotificationChannelListResponseDto })
  async list(): Promise<NotificationChannelListResponseDto> {
    const items = await this.channels.list();
    return {
      items: items.map((item) =>
        NotificationChannelResponseDto.fromEntity(item, this.crypto),
      ),
    };
  }

  @Get(':channelId')
  @Roles(...ROLE_MATRIX.dataView)
  @ApiOkResponse({ type: NotificationChannelResponseDto })
  @ApiNotFoundResponse({ description: 'NOTIFICATION_CHANNEL_NOT_FOUND' })
  async findOne(
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ): Promise<NotificationChannelResponseDto> {
    const channel = await this.channels.findOne(channelId);
    return NotificationChannelResponseDto.fromEntity(channel, this.crypto);
  }

  @Post()
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiCreatedResponse({ type: NotificationChannelResponseDto })
  async create(
    @Body() dto: CreateNotificationChannelDto,
  ): Promise<NotificationChannelResponseDto> {
    const channel = await this.channels.create(dto);
    return NotificationChannelResponseDto.fromEntity(channel, this.crypto);
  }

  @Patch(':channelId')
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiOkResponse({ type: NotificationChannelResponseDto })
  @ApiNotFoundResponse({ description: 'NOTIFICATION_CHANNEL_NOT_FOUND' })
  async update(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: UpdateNotificationChannelDto,
  ): Promise<NotificationChannelResponseDto> {
    const channel = await this.channels.update(channelId, dto);
    return NotificationChannelResponseDto.fromEntity(channel, this.crypto);
  }

  @Delete(':channelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NOTIFICATION_CHANNEL_NOT_FOUND' })
  async delete(
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ): Promise<void> {
    await this.channels.delete(channelId);
  }

  @Post(':channelId/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ROLE_MATRIX.connectionManage)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NOTIFICATION_CHANNEL_NOT_FOUND' })
  async test(
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ): Promise<void> {
    await this.channels.test(channelId);
  }
}
