import { ApiProperty } from '@nestjs/swagger';
import {
  Connection,
  ConnectionAuthType,
  ConnectionBackfillProgress,
  ConnectionBackfillStatus,
  ConnectionStatus,
  ConnectionType,
} from '../entities/connection.entity';

/** `credentials_encrypted` hiçbir zaman response'a konmaz (CLAUDE.md kural 9). */
export class ConnectionResponseDto {
  id!: string;
  projectId!: string;

  @ApiProperty({ enum: ConnectionType, enumName: 'ConnectionType' })
  type!: ConnectionType;

  externalId!: string;

  @ApiProperty({ enum: ConnectionAuthType, enumName: 'ConnectionAuthType' })
  authType!: ConnectionAuthType;

  @ApiProperty({ enum: ConnectionStatus, enumName: 'ConnectionStatus' })
  status!: ConnectionStatus;

  lastVerifiedAt!: Date | null;
  lastSyncedAt!: Date | null;
  lastError!: string | null;

  @ApiProperty({
    enum: ConnectionBackfillStatus,
    enumName: 'ConnectionBackfillStatus',
  })
  backfillStatus!: ConnectionBackfillStatus;

  backfillProgress!: ConnectionBackfillProgress;

  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(connection: Connection): ConnectionResponseDto {
    return {
      id: connection.id,
      projectId: connection.projectId,
      type: connection.type,
      externalId: connection.externalId,
      authType: connection.authType,
      status: connection.status,
      lastVerifiedAt: connection.lastVerifiedAt,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
      backfillStatus: connection.backfillStatus,
      backfillProgress: connection.backfillProgress,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}

export class ConnectionListResponseDto {
  items!: ConnectionResponseDto[];
}

export class ServiceAccountResponseDto {
  email!: string;
}

export class GscSiteResponseDto {
  siteUrl!: string;
  permissionLevel!: string;
}

export class GscSiteListResponseDto {
  items!: GscSiteResponseDto[];
}
