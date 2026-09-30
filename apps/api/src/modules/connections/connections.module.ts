import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ClientsModule } from '../clients/clients.module';
import { ConnectionController } from './connection.controller';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { Connection } from './entities/connection.entity';

/** ARCHITECTURE §5.2, §9.1, §9.2: GSC/GA4 bağlantıları ve doğrulama akışı. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Connection]),
    ConnectorsModule,
    AuditLogsModule,
    ClientsModule,
  ],
  controllers: [ConnectionsController, ConnectionController],
  providers: [provideTenantRepository(Connection), ConnectionsService],
})
export class ConnectionsModule {}
