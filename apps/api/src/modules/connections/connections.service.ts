import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ga4Client } from '../../connectors/ga4/ga4.client';
import { ConnectorError } from '../../connectors/errors';
import { GscClient, GscSite } from '../../connectors/gsc/gsc.client';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ProjectStatus } from '../clients/entities/project.entity';
import { ProjectsService } from '../clients/projects.service';
import {
  ConnectionNotFoundError,
  ConnectionTypeTakenError,
} from './connections.errors';
import {
  Connection,
  ConnectionBackfillProgress,
  ConnectionBackfillStatus,
  ConnectionStatus,
  ConnectionType,
} from './entities/connection.entity';
import {
  CONNECTION_ACTIVATED_EVENT,
  ConnectionActivatedEvent,
} from './events/connection-activated.event';

/** Dispatcher'ın kuyruğa ekleyeceği aktif bağlantı (org'lar arası sistem okuması). */
export interface DispatchableConnection {
  connectionId: string;
  orgId: string;
  projectId: string;
}

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
    @InjectRepository(Connection)
    private readonly systemConnections: Repository<Connection>,
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

  /** Projenin bağlantısı (tip başına en fazla bir tane); yoksa null. */
  async findByProjectAndType(
    projectId: string,
    type: ConnectionType,
  ): Promise<Connection | null> {
    return this.connections.findOneBy({ projectId, type });
  }

  /** Sync başarıyla bitti. */
  async markSynced(id: string): Promise<void> {
    await this.connections.update({ id }, { lastSyncedAt: new Date() });
  }

  /**
   * Sync sırasında yetki kaybı (403): bağlantı `error`'a çekilir, yeniden
   * doğrulanana kadar sync'ler atlanır. `message` connector'ın anlaşılır
   * mesajıdır, dış API gövdesi değil.
   */
  async markSyncFailed(id: string, message: string): Promise<void> {
    await this.connections.update(
      { id },
      { status: ConnectionStatus.Error, lastError: message },
    );
  }

  async startBackfill(
    id: string,
    progress: Required<ConnectionBackfillProgress>,
  ): Promise<void> {
    await this.connections.update(
      { id },
      {
        backfillStatus: ConnectionBackfillStatus.Running,
        backfillProgress: progress,
      },
    );
  }

  /**
   * Backfill'in bir günü bitti: `done` atomik olarak artırılır, `total`'a
   * ulaşınca durum `done` olur. Eşzamanlı job'lar birbirinin artışını ezmesin
   * diye hesap SQL'de yapılır (UPDATE'teki her ifade satırın eski değerini
   * görür). Backfill `running` değilse (ör. başarısız oldu) sayılmaz.
   */
  async recordBackfillDayDone(id: string): Promise<void> {
    const done = `COALESCE((backfill_progress->>'done')::int, 0) + 1`;
    const total = `COALESCE((backfill_progress->>'total')::int, 0)`;
    await this.connections.update(
      { id, backfillStatus: ConnectionBackfillStatus.Running },
      {
        backfillProgress: () =>
          `jsonb_set(backfill_progress, '{done}', to_jsonb(LEAST(${done}, ${total})))`,
        backfillStatus: () =>
          `CASE WHEN ${done} >= ${total} THEN 'done'::connection_backfill_status ELSE 'running'::connection_backfill_status END`,
      },
    );
  }

  async markBackfillFailed(id: string): Promise<void> {
    await this.connections.update(
      { id },
      { backfillStatus: ConnectionBackfillStatus.Failed },
    );
  }

  /**
   * Günlük dispatcher için tüm org'lardaki aktif projelerin aktif
   * bağlantıları. Bilerek org kapsamı dışında bir sistem okumasıdır (tenant
   * context'i yok); dönen her satır kendi `orgId`'siyle job'a yazılır ve
   * job'un kendisi o org'un kapsamında çalışır. Sıra deterministiktir.
   */
  async listActiveForDispatch(
    type: ConnectionType,
  ): Promise<DispatchableConnection[]> {
    const rows = await this.systemConnections
      .createQueryBuilder('connection')
      .innerJoin('connection.project', 'project')
      .select('connection.id', 'connectionId')
      .addSelect('connection.org_id', 'orgId')
      .addSelect('connection.project_id', 'projectId')
      .where('connection.type = :type', { type })
      .andWhere('connection.status = :status', {
        status: ConnectionStatus.Active,
      })
      .andWhere('project.status = :projectStatus', {
        projectStatus: ProjectStatus.Active,
      })
      .orderBy('connection.org_id', 'ASC')
      .addOrderBy('connection.project_id', 'ASC')
      .getRawMany<DispatchableConnection>();
    return rows;
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
