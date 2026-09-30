import { ClsService } from 'nestjs-cls';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  InsertResult,
  Not,
  QueryDeepPartialEntity,
  Repository,
  SaveOptions,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { TenantScopedEntity } from '../../database/entities/tenant-scoped.entity';
import { AppClsStore } from '../cls-store';
import {
  TenantContextMissingError,
  TenantMismatchError,
} from './tenant.errors';

type Where<T> = FindOptionsWhere<T> | FindOptionsWhere<T>[];
type Criteria<T> = string | string[] | Where<T>;

const QUERY_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Çağıranın kendi `:orgId` parametresiyle çakışıp şartı değiştirmemesi için ayrı isim.
const ORG_PARAM = 'tenantScopeOrgId';

/**
 * CLAUDE.md kural 4'ün repository seviyesindeki güvencesi. Her işlem CLS'teki
 * orgId ile kapsamlanır; orgId yoksa TenantContextMissingError fırlatılır.
 * Çağıranın verdiği orgId her zaman CLS'tekiyle ezilir.
 *
 * Ham Repository, manager ya da query bilerek dışarı açılmaz.
 */
export class TenantRepository<T extends TenantScopedEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find(this.scopeOptions(options));
  }

  findBy(where: Where<T>): Promise<T[]> {
    return this.repository.findBy(this.scopeWhere(where));
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(this.scopeOptions(options));
  }

  findOneBy(where: Where<T>): Promise<T | null> {
    return this.repository.findOneBy(this.scopeWhere(where));
  }

  findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repository.findAndCount(this.scopeOptions(options));
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    return this.repository.count(this.scopeOptions(options));
  }

  countBy(where: Where<T>): Promise<number> {
    return this.repository.countBy(this.scopeWhere(where));
  }

  exists(options: FindManyOptions<T> = {}): Promise<boolean> {
    return this.repository.exists(this.scopeOptions(options));
  }

  existsBy(where: Where<T>): Promise<boolean> {
    return this.repository.existsBy(this.scopeWhere(where));
  }

  save<E extends DeepPartial<T>>(
    entity: E,
    options?: SaveOptions,
  ): Promise<E & T>;
  save<E extends DeepPartial<T>>(
    entities: E[],
    options?: SaveOptions,
  ): Promise<(E & T)[]>;
  async save<E extends DeepPartial<T>>(
    entityOrEntities: E | E[],
    options?: SaveOptions,
  ): Promise<(E & T) | (E & T)[]> {
    const orgId = this.requireOrgId();
    const entities = Array.isArray(entityOrEntities)
      ? entityOrEntities
      : [entityOrEntities];
    const existingIds = entities
      .map((entity) => entity.id)
      .filter((id): id is string => typeof id === 'string' && id !== '');

    // save() var olan satırı yalnız id ile bulup günceller. Başka org'a ait bir
    // id ile çağrılırsa o satırı ele geçirmesin diye önce kontrol edilir.
    if (existingIds.length > 0) {
      const foreign = await this.repository.countBy({
        id: In(existingIds),
        orgId: Not(orgId),
      } as FindOptionsWhere<T>);
      if (foreign > 0) {
        throw new TenantMismatchError();
      }
    }

    for (const entity of entities) {
      this.assignOrg(entity, orgId);
    }

    if (Array.isArray(entityOrEntities)) {
      return this.repository.save(entityOrEntities, options);
    }
    return this.repository.save(entityOrEntities, options);
  }

  insert(
    entityOrEntities: QueryDeepPartialEntity<T> | QueryDeepPartialEntity<T>[],
  ): Promise<InsertResult> {
    const orgId = this.requireOrgId();
    const entities = Array.isArray(entityOrEntities)
      ? entityOrEntities
      : [entityOrEntities];
    for (const entity of entities as { id?: unknown; orgId?: unknown }[]) {
      this.assignOrg(entity, orgId);
      // insert() entity listener'larını düz objelerde çalıştırmaz; id burada üretilir.
      if (!entity.id) {
        entity.id = uuidv7();
      }
    }
    return this.repository.insert(entityOrEntities);
  }

  update(
    criteria: Criteria<T>,
    partialEntity: QueryDeepPartialEntity<T>,
  ): Promise<UpdateResult> {
    const orgId = this.requireOrgId();
    const partial = { ...partialEntity };
    if ('orgId' in partial) {
      if (partial.orgId !== orgId) {
        throw new TenantMismatchError();
      }
      delete partial.orgId;
    }
    return this.repository.update(this.scopeCriteria(criteria), partial);
  }

  delete(criteria: Criteria<T>): Promise<DeleteResult> {
    this.requireOrgId();
    return this.repository.delete(this.scopeCriteria(criteria));
  }

  /**
   * `alias.org_id` şartıyla başlatılmış bir query builder döner.
   * Ek şartlar için `andWhere` kullan: `where` org şartını ezer, `orWhere`
   * ise onu etkisiz bırakır. OR gerekiyorsa `andWhere(new Brackets(...))` kullan.
   */
  createQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const orgId = this.requireOrgId();
    if (!QUERY_ALIAS_PATTERN.test(alias)) {
      throw new Error(`Geçersiz query builder alias'ı: ${alias}`);
    }
    return this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.org_id = :${ORG_PARAM}`, { [ORG_PARAM]: orgId });
  }

  private requireOrgId(): string {
    const orgId = this.cls.isActive() ? this.cls.get('orgId') : undefined;
    if (!orgId) {
      throw new TenantContextMissingError();
    }
    return orgId;
  }

  private scopeOptions<O extends FindOneOptions<T>>(options: O): O {
    return { ...options, where: this.scopeWhere(options.where) };
  }

  private scopeWhere(where: Where<T> | undefined): Where<T> {
    const orgId = this.requireOrgId();
    const withOrg = (condition: FindOptionsWhere<T>): FindOptionsWhere<T> => ({
      ...condition,
      orgId,
    });

    if (Array.isArray(where)) {
      // OR koşulunun her kolu ayrı ayrı kapsanır; boş dizi tüm org'u döndürür.
      return where.length > 0 ? where.map(withOrg) : withOrg({});
    }
    return withOrg(where ?? {});
  }

  private scopeCriteria(criteria: Criteria<T>): Where<T> {
    if (typeof criteria === 'string') {
      return this.scopeWhere({ id: criteria } as FindOptionsWhere<T>);
    }
    if (Array.isArray(criteria)) {
      if (criteria.length === 0) {
        throw new Error('Boş criteria ile update/delete yapılamaz.');
      }
      if (criteria.every((item) => typeof item === 'string')) {
        return this.scopeWhere({ id: In(criteria) } as FindOptionsWhere<T>);
      }
      if (criteria.some((item) => !isPlainCondition(item))) {
        throw new Error('Desteklenmeyen update/delete criteria.');
      }
      return this.scopeWhere(criteria);
    }
    if (!isPlainCondition(criteria)) {
      throw new Error('Desteklenmeyen update/delete criteria.');
    }
    return this.scopeWhere(criteria);
  }

  private assignOrg(entity: { orgId?: unknown }, orgId: string): void {
    if (entity.orgId !== undefined && entity.orgId !== orgId) {
      throw new TenantMismatchError();
    }
    entity.orgId = orgId;
  }
}

/**
 * update/delete için yalnız en az bir alan içeren düz obje şart kabul edilir.
 * Boş obje org'un tüm satırlarını etkilerdi; Date/number gibi değerler desteklenmez.
 */
function isPlainCondition(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length > 0
  );
}
