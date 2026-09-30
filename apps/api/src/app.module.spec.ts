import 'reflect-metadata';
import { ApplicationConfig } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { RolesGuard } from './common/tenancy/roles.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { TenantGuard } from './modules/organizations/guards/tenant.guard';

describe('AppModule', () => {
  it("HousekeepingModule'ü import etmez (bakım cron'ları sadece worker'da yüklenir)", () => {
    const imports =
      (Reflect.getMetadata('imports', AppModule) as unknown[] | undefined) ??
      [];

    expect(imports).not.toContain(HousekeepingModule);
  });

  it('global guard’lar JwtAuthGuard → TenantGuard → RolesGuard sırasıyla çalışır (§4.3)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });

    try {
      const chain: unknown[] = [JwtAuthGuard, TenantGuard, RolesGuard];
      // nestjs-cls da (middleware modunda boş) bir global guard kaydeder.
      const guards = app
        .get(ApplicationConfig)
        .getGlobalGuards()
        .map((guard) => guard.constructor)
        .filter((type) => chain.includes(type));

      expect(guards).toEqual(chain);
    } finally {
      await app.close();
    }
  });
});
