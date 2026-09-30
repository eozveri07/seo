import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Ga4Client } from '../../connectors/ga4/ga4.client';
import { ConnectorError } from '../../connectors/errors';
import { GscClient, GscSite } from '../../connectors/gsc/gsc.client';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ProjectsService } from '../clients/projects.service';
import {
  ConnectionNotFoundError,
  ConnectionTypeTakenError,
} from './connections.errors';
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
} from './entities/connection.entity';
import {
  CONNECTION_ACTIVATED_EVENT,
  ConnectionActivatedEvent,
} from './events/connection-activated.event';

export interface CreateConnectionInput {
  projectId: string;
  type: ConnectionType;
  externalId: string;
}

/**
 * Bağlantı CRUD'u ve doğrulaması (ARCHITECTURE §5.2, §9.1, §9.2). Doğrulama
 * dış API'yi `GscClient`/`Ga4Client` üzerinden çağırır (CLAUDE.md kural 5);
 * dış API gövdesi asla `status`/`last_error`'a konmaz, yalnız anlaşılır bir
 * mesaj.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    @InjectTenantRepository(Connection)
    private readonly connections: TenantRepository<Connection>,
    private readonly projectsService: ProjectsService,
    private readonly gscClient: GscClient,
    private readonly ga4Client: Ga4Client,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async listByProject(projectId: string): Promise<Connection[]> {
    return this.connections.findBy({ projectId });
  }

  async create(input: CreateConnectionInput): Promise<Connection> {
    const existing = await this.connections.findOneBy({
      projectId: input.projectId,
      type: input.type,
    });
    if (existing) {
      throw new ConnectionTypeTakenError();
    }

    const connection = await this.connections.save({
      projectId: input.projectId,
      type: input.type,
      externalId: input.externalId,
      status: ConnectionStatus.Pending,
    });
    await this.audit.record({
      action: AuditAction.ConnectionCreated,
      entityType: 'connection',
      entityId: connection.id,
      changes: { type: connection.type, externalId: connection.externalId },
    });
    return connection;
  }

  async findOne(id: string, actor: TenantContext): Promise<Connection> {
    const connection = await this.connections.findOneBy({ id });
    if (!connection) {
      throw new ConnectionNotFoundError();
    }
    await this.ensureVisible(connection, actor);
    return connection;
  }

  async delete(id: string, actor: TenantContext): Promise<void> {
    const connection = await this.findOne(id, actor);
    await this.connections.delete({ id: connection.id });
    await this.audit.record({
      action: AuditAction.ConnectionDeleted,
      entityType: 'connection',
      entityId: connection.id,
      changes: { type: connection.type },
    });
  }

  /**
   * GSC'de `sites.list`, GA4'te 1 günlük basit bir rapor çekilir. Sonuç
   * `status`/`last_verified_at`/`last_error`'a yazılır. `active`'e geçilirse
   * `connection.activated` yayılır (T1.5 backfill'i bunu dinler).
   */
  async verify(id: string, actor: TenantContext): Promise<Connection> {
    const connection = await this.findOne(id, actor);
    const wasActive = connection.status === ConnectionStatus.Active;

    try {
      if (connection.type === ConnectionType.Gsc) {
        await this.gscClient.verifyProperty(connection.externalId);
      } else {
        await this.ga4Client.verifyProperty(connection.externalId);
      }
      connection.status = ConnectionStatus.Active;
      connection.lastError = null;
    } catch (error) {
      connection.status = ConnectionStatus.Error;
      connection.lastError = this.describeError(error);
    }
    connection.lastVerifiedAt = new Date();

    await this.connections.update(
      { id: connection.id },
      {
        status: connection.status,
        lastError: connection.lastError,
        lastVerifiedAt: connection.lastVerifiedAt,
      },
    );
    await this.audit.record({
      action: AuditAction.ConnectionVerified,
      entityType: 'connection',
      entityId: connection.id,
      changes: { status: connection.status },
    });

    if (!wasActive && connection.status === ConnectionStatus.Active) {
      this.events.emit(
        CONNECTION_ACTIVATED_EVENT,
        new ConnectionActivatedEvent(
          connection.id,
          connection.orgId,
          connection.projectId,
          connection.type,
        ),
      );
    }

    return connection;
  }

  getServiceAccountEmail(): string {
    return this.gscClient.getServiceAccountEmail();
  }

  async listGscSites(): Promise<GscSite[]> {
    return this.gscClient.listSites();
  }

  /** Dış API gövdesini asla döndürmez; yalnız anlaşılır bir mesaj. */
  private describeError(error: unknown): string {
    if (error instanceof ConnectorError) {
      return error.message;
    }
    return 'Doğrulama sırasında beklenmeyen bir hata oluştu.';
  }

  private async ensureVisible(
    connection: Connection,
    actor: TenantContext,
  ): Promise<void> {
    if (actor.role !== OrgRole.ClientViewer) {
      return;
    }
    let project;
    try {
      project = await this.projectsService.findOne(connection.projectId);
    } catch {
      throw new ConnectionNotFoundError();
    }
    if (project.clientId !== actor.clientId) {
      throw new ConnectionNotFoundError();
    }
  }
}
