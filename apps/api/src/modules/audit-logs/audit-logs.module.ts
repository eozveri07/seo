import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [provideTenantRepository(AuditLog), AuditService],
  exports: [AuditService],
})
export class AuditLogsModule {}
