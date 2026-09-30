import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SummarySharedModule } from '../summary/summary-shared.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { Project } from './entities/project.entity';
import { ProjectAccessGuard } from './guards/project-access.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Client ve proje CRUD'u (ARCHITECTURE §5.2). `ProjectAccessGuard` burada
 * global kaydedilir; `AppModule`'de `OrganizationsModule`'den (TenantGuard,
 * RolesGuard) sonra import edilir, sıra `app.module.spec.ts`'te doğrulanır.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Project]),
    AuditLogsModule,
    SummarySharedModule,
  ],
  controllers: [ClientsController, ProjectsController],
  providers: [
    provideTenantRepository(Client),
    provideTenantRepository(Project),
    ClientsService,
    ProjectsService,
    { provide: APP_GUARD, useClass: ProjectAccessGuard },
  ],
  exports: [ProjectsService],
})
export class ClientsModule {}
