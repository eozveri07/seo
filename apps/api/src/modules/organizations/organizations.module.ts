import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../common/tenancy/roles.guard';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { CacheModule } from '../../infra/cache/cache.module';
import { MailModule } from '../../infra/mail/mail.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { UsersModule } from '../users/users.module';
import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { Organization } from './entities/organization.entity';
import { TenantGuard } from './guards/tenant.guard';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersController } from './members.controller';
import { MembershipCache } from './membership-cache';
import { MembershipsService } from './memberships.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Organizasyonlar, üyelikler, davetler ve tenant guard zinciri (ARCHITECTURE §4).
 *
 * TenantGuard ve RolesGuard burada global kaydedilir. Global guard'lar modül
 * kayıt sırasıyla çalışır; bu modül AuthModule'den (JwtAuthGuard) sonra
 * import edilir, sıra `app.module.spec.ts`'te doğrulanır.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Membership, Invitation]),
    UsersModule,
    AuditLogsModule,
    MailModule,
    CacheModule,
  ],
  controllers: [
    OrganizationsController,
    MembersController,
    InvitationsController,
  ],
  providers: [
    provideTenantRepository(Membership),
    provideTenantRepository(Invitation),
    MembershipCache,
    MembershipsService,
    OrganizationsService,
    InvitationsService,
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [InvitationsService],
})
export class OrganizationsModule {}
