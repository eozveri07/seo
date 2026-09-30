import { Inject, Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';
import { TenantScopedEntity } from '../../database/entities/tenant-scoped.entity';
import { AppClsStore } from '../cls-store';
import { TenantRepository } from './tenant.repository';

type EntityClass<T extends TenantScopedEntity> = abstract new () => T;

export function getTenantRepositoryToken<T extends TenantScopedEntity>(
  entity: EntityClass<T>,
): string {
  return `TenantRepository<${entity.name}>`;
}

/**
 * Modülün kendi entity'si için TenantRepository provider'ı. Kural 1 gereği her
 * modül yalnız kendi entity'sini kullanır:
 *
 *   imports: [TypeOrmModule.forFeature([Keyword])],
 *   providers: [provideTenantRepository(Keyword), KeywordsService],
 *
 *   constructor(@InjectTenantRepository(Keyword) private readonly keywords: TenantRepository<Keyword>) {}
 */
export function provideTenantRepository<T extends TenantScopedEntity>(
  entity: EntityClass<T>,
): Provider {
  return {
    provide: getTenantRepositoryToken(entity),
    inject: [getRepositoryToken(entity), ClsService],
    useFactory: (repository: Repository<T>, cls: ClsService<AppClsStore>) =>
      new TenantRepository(repository, cls),
  };
}

export function InjectTenantRepository<T extends TenantScopedEntity>(
  entity: EntityClass<T>,
): ParameterDecorator {
  return Inject(getTenantRepositoryToken(entity));
}
