import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Ga4Client } from '../../connectors/ga4/ga4.client';
import { ConnectorPermanentError } from '../../connectors/errors';
import { GscClient } from '../../connectors/gsc/gsc.client';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { AuditService } from '../audit-logs/audit.service';
import { ProjectNotFoundError } from '../clients/clients.errors';
import { ProjectsService } from '../clients/projects.service';
import { ConnectionsService } from './connections.service';
import {
  ConnectionNotFoundError,
  ConnectionTypeTakenError,
} from './connections.errors';
import {
  Connection,
  ConnectionBackfillStatus,
  ConnectionStatus,
  ConnectionType,
} from './entities/connection.entity';
import { CONNECTION_ACTIVATED_EVENT } from './events/connection-activated.event';

const PROJECT_ID = '0190f0e4-0000-7000-8000-000000000001';
const CLIENT_ID = '0190f0e4-0000-7000-8000-000000000002';
const OTHER_CLIENT_ID = '0190f0e4-0000-7000-8000-000000000003';
const CONNECTION_ID = '0190f0e4-0000-7000-8000-000000000004';

function buildConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: CONNECTION_ID,
    orgId: 'org-1',
    projectId: PROJECT_ID,
    type: ConnectionType.Gsc,
    externalId: 'sc-domain:example.com',
    authType: 'service_account',
    credentialsEncrypted: null,
    status: ConnectionStatus.Pending,
    lastVerifiedAt: null,
    lastSyncedAt: null,
    lastError: null,
    backfillStatus: 'pending',
    backfillProgress: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Connection;
}

const ownerActor: TenantContext = {
  orgId: 'org-1',
  role: OrgRole.Owner,
  clientId: null,
};

const clientViewerActor: TenantContext = {
  orgId: 'org-1',
  role: OrgRole.ClientViewer,
  clientId: CLIENT_ID,
};

function buildService(overrides?: {
  connection?: Connection;
  projectClientId?: string;
}) {
  const connection = overrides?.connection ?? buildConnection();
  const connections = {
    findOneBy: jest.fn().mockResolvedValue(connection),
    findBy: jest.fn().mockResolvedValue([connection]),
    save: jest.fn().mockResolvedValue(connection),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const projectsService: Pick<ProjectsService, 'findOne'> = {
    findOne: jest.fn().mockResolvedValue({
      id: PROJECT_ID,
      clientId: overrides?.projectClientId ?? CLIENT_ID,
    }),
  };
  const gscClient: Pick<
    GscClient,
    'verifyProperty' | 'getServiceAccountEmail' | 'listSites'
  > = {
    verifyProperty: jest.fn().mockResolvedValue(undefined),
    getServiceAccountEmail: jest.fn().mockReturnValue('sa@example.com'),
    listSites: jest.fn().mockResolvedValue([]),
  };
  const ga4Client: Pick<Ga4Client, 'verifyProperty'> = {
    verifyProperty: jest.fn().mockResolvedValue(undefined),
  };
  const audit: Pick<AuditService, 'record'> = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const dispatchRows = [
    { connectionId: CONNECTION_ID, orgId: 'org-1', projectId: PROJECT_ID },
  ];
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    queryBuilder[method] = jest.fn(() => queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn().mockResolvedValue(dispatchRows);
  const systemConnections = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  const service = new ConnectionsService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connections as any,
    projectsService as ProjectsService,
    gscClient as GscClient,
    ga4Client as Ga4Client,
    audit as AuditService,
    events as unknown as EventEmitter2,
    systemConnections as unknown as Repository<Connection>,
  );

  return {
    service,
    connections,
    projectsService,
    gscClient,
    ga4Client,
    audit,
    events,
    connection,
    queryBuilder,
    dispatchRows,
  };
}

describe('ConnectionsService', () => {
  describe('create', () => {
    it('(project_id, type) için zaten varsa ConnectionTypeTakenError fırlatır', async () => {
      const { service } = buildService();

      await expect(
        service.create({
          projectId: PROJECT_ID,
          type: ConnectionType.Gsc,
          externalId: 'sc-domain:example.com',
        }),
      ).rejects.toBeInstanceOf(ConnectionTypeTakenError);
    });
  });

  describe('verify', () => {
    it('GSC doğrulaması başarılıysa active olur ve connection.activated yayılır', async () => {
      const { service, connections, gscClient, events } = buildService();

      const result = await service.verify(CONNECTION_ID, ownerActor);

      expect(gscClient.verifyProperty).toHaveBeenCalledWith(
        'sc-domain:example.com',
      );
      expect(result.status).toBe(ConnectionStatus.Active);
      expect(result.lastError).toBeNull();
      expect(connections.update).toHaveBeenCalledWith(
        { id: CONNECTION_ID },
        expect.objectContaining({ status: ConnectionStatus.Active }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        CONNECTION_ACTIVATED_EVENT,
        expect.objectContaining({ connectionId: CONNECTION_ID }),
      );
    });

    it('yetkisiz property doğrulamada error olur, anlaşılır mesaj yazılır, event yayılmaz', async () => {
      const connection = buildConnection();
      const { service, connections, gscClient, events } = buildService({
        connection,
      });
      (gscClient.verifyProperty as jest.Mock).mockRejectedValue(
        new ConnectorPermanentError(
          "Service account bu property'ye eklenmemiş",
        ),
      );

      const result = await service.verify(CONNECTION_ID, ownerActor);

      expect(result.status).toBe(ConnectionStatus.Error);
      expect(result.lastError).toBe(
        "Service account bu property'ye eklenmemiş",
      );
      expect(connections.update).toHaveBeenCalledWith(
        { id: CONNECTION_ID },
        expect.objectContaining({ status: ConnectionStatus.Error }),
      );
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('zaten active olan bağlantı tekrar doğrulanırsa event tekrar yayılmaz', async () => {
      const connection = buildConnection({ status: ConnectionStatus.Active });
      const { service, events } = buildService({ connection });

      await service.verify(CONNECTION_ID, ownerActor);

      expect(events.emit).not.toHaveBeenCalled();
    });

    it('GA4 tipi için Ga4Client kullanılır', async () => {
      const connection = buildConnection({
        type: ConnectionType.Ga4,
        externalId: 'properties/123',
      });
      const { service, ga4Client, gscClient } = buildService({ connection });

      await service.verify(CONNECTION_ID, ownerActor);

      expect(ga4Client.verifyProperty).toHaveBeenCalledWith('properties/123');
      expect(gscClient.verifyProperty).not.toHaveBeenCalled();
    });
  });

  describe('client_viewer scope', () => {
    it("kendi client'ının bağlantısını görebilir", async () => {
      const { service } = buildService({ projectClientId: CLIENT_ID });

      await expect(
        service.findOne(CONNECTION_ID, clientViewerActor),
      ).resolves.toMatchObject({ id: CONNECTION_ID });
    });

    it("başka client'ın bağlantısında ConnectionNotFoundError fırlatır", async () => {
      const { service } = buildService({ projectClientId: OTHER_CLIENT_ID });

      await expect(
        service.findOne(CONNECTION_ID, clientViewerActor),
      ).rejects.toBeInstanceOf(ConnectionNotFoundError);
    });

    it('proje bulunamazsa (silinmişse) ConnectionNotFoundError fırlatır', async () => {
      const { service, projectsService } = buildService();
      (projectsService.findOne as jest.Mock).mockRejectedValue(
        new ProjectNotFoundError(),
      );

      await expect(
        service.findOne(CONNECTION_ID, clientViewerActor),
      ).rejects.toBeInstanceOf(ConnectionNotFoundError);
    });
  });

  describe('bulunamayan bağlantı', () => {
    it('findOne bulunamazsa ConnectionNotFoundError fırlatır', async () => {
      const { service, connections } = buildService();
      connections.findOneBy.mockResolvedValue(null);

      await expect(
        service.findOne(CONNECTION_ID, ownerActor),
      ).rejects.toBeInstanceOf(ConnectionNotFoundError);
    });
  });

  describe('sync ve backfill durumu', () => {
    it("markSyncFailed bağlantıyı error'a çeker ve mesajı yazar", async () => {
      const { service, connections } = buildService();

      await service.markSyncFailed(CONNECTION_ID, 'Yetki kaldırıldı');

      expect(connections.update).toHaveBeenCalledWith(
        { id: CONNECTION_ID },
        { status: ConnectionStatus.Error, lastError: 'Yetki kaldırıldı' },
      );
    });

    it('startBackfill durumu running yapar ve ilerlemeyi yazar', async () => {
      const { service, connections } = buildService();
      const progress = {
        from: '2025-05-30',
        to: '2026-09-29',
        done: 0,
        total: 488,
      };

      await service.startBackfill(CONNECTION_ID, progress);

      expect(connections.update).toHaveBeenCalledWith(
        { id: CONNECTION_ID },
        {
          backfillStatus: ConnectionBackfillStatus.Running,
          backfillProgress: progress,
        },
      );
    });

    it('recordBackfillDayDone yalnız running backfill için done sayacını SQL içinde artırır', async () => {
      const { service, connections } = buildService();

      await service.recordBackfillDayDone(CONNECTION_ID);

      const [criteria, partial] = connections.update.mock.calls[0] as [
        unknown,
        { backfillProgress: () => string; backfillStatus: () => string },
      ];
      expect(criteria).toEqual({
        id: CONNECTION_ID,
        backfillStatus: ConnectionBackfillStatus.Running,
      });
      expect(partial.backfillProgress()).toContain(
        "jsonb_set(backfill_progress, '{done}'",
      );
      expect(partial.backfillStatus()).toContain(
        "'done'::connection_backfill_status",
      );
    });
  });

  describe('listActiveForDispatch', () => {
    it('aktif projelerin aktif bağlantılarını org ve proje sırasıyla döner', async () => {
      const { service, queryBuilder, dispatchRows } = buildService();

      const rows = await service.listActiveForDispatch(ConnectionType.Gsc);

      expect(rows).toEqual(dispatchRows);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'connection.type = :type',
        { type: ConnectionType.Gsc },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'connection.status = :status',
        { status: ConnectionStatus.Active },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'project.status = :projectStatus',
        { projectStatus: 'active' },
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'connection.org_id',
        'ASC',
      );
    });
  });
});
