import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { DataSource, EntityManager, FindOperator, Repository } from 'typeorm';
import { InvalidRefreshTokenError } from './auth.errors';
import { RefreshToken } from './refresh-token.entity';
import { hashRefreshToken, RefreshTokenService } from './refresh-token.service';

type Row = Omit<RefreshToken, 'ensureId'>;
type Criteria = Partial<Record<keyof Row, unknown>>;

/**
 * refresh_tokens için bellek içi sahte depo. Update, Postgres'teki gibi
 * satırı o anki değerine göre koşullu değiştirir; transaction hata alırsa
 * içinde eklenen satırlar geri alınır.
 */
class InMemoryRefreshTokens {
  readonly rows = new Map<string, Row>();

  repository(inserted?: string[]): Repository<RefreshToken> {
    const repo = {
      findOneBy: (criteria: Criteria) => {
        const row = [...this.rows.values()].find((r) =>
          this.matches(r, criteria),
        );
        return Promise.resolve(row ? { ...row } : null);
      },
      insert: (values: Row) => {
        if (
          [...this.rows.values()].some((r) => r.tokenHash === values.tokenHash)
        ) {
          return Promise.reject(new Error('duplicate token_hash'));
        }
        this.rows.set(values.id, { ...values });
        inserted?.push(values.id);
        return Promise.resolve({});
      },
      update: (criteria: Criteria, patch: Partial<Row>) => {
        let affected = 0;
        for (const row of this.rows.values()) {
          if (this.matches(row, criteria)) {
            Object.assign(row, patch);
            affected += 1;
          }
        }
        return Promise.resolve({ affected });
      },
      manager: undefined as unknown as EntityManager,
    };
    repo.manager = this.manager(inserted);
    return repo as unknown as Repository<RefreshToken>;
  }

  manager(inserted?: string[]): EntityManager {
    return {
      getRepository: () => this.repository(inserted),
    } as unknown as EntityManager;
  }

  dataSource(): DataSource {
    return {
      transaction: async <T>(cb: (manager: EntityManager) => Promise<T>) => {
        const inserted: string[] = [];
        try {
          return await cb(this.manager(inserted));
        } catch (error) {
          inserted.forEach((id) => this.rows.delete(id));
          throw error;
        }
      },
    } as unknown as DataSource;
  }

  family(familyId: string): Row[] {
    return [...this.rows.values()].filter((row) => row.familyId === familyId);
  }

  private matches(row: Row, criteria: Criteria): boolean {
    return Object.entries(criteria).every(([key, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      if (expected instanceof FindOperator) {
        return expected.type === 'isNull' ? actual === null : false;
      }
      return actual === expected;
    });
  }
}

const USER_ID = '0190f0e4-0000-7000-8000-0000000000a1';
const META = { userAgent: 'jest', ip: '127.0.0.1' };

function setup() {
  const store = new InMemoryRefreshTokens();
  const config = {
    get: jest.fn((key: string) =>
      key === 'REFRESH_TOKEN_TTL_DAYS' ? 30 : undefined,
    ),
  };
  const service = new RefreshTokenService(
    store.repository(),
    store.dataSource(),
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { store, service };
}

describe('RefreshTokenService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('issue', () => {
    it('opak token üretir, DB’de yalnız SHA-256 hash’ini ve 30 gün sonrasını tutar', async () => {
      const { store, service } = setup();
      const before = Date.now();

      const issued = await service.issue(USER_ID, META);

      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [row] = [...store.rows.values()];
      expect(row.tokenHash).toBe(hashRefreshToken(issued.token));
      expect(row.tokenHash).not.toContain(issued.token);
      expect(row.userId).toBe(USER_ID);
      expect(row.familyId).toBe(issued.familyId);
      const days = (row.expiresAt.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThanOrEqual(30);
      expect(days).toBeLessThan(30.01);
    });

    it('her login yeni bir aile başlatır', async () => {
      const { service } = setup();

      const a = await service.issue(USER_ID, META);
      const b = await service.issue(USER_ID, META);

      expect(a.familyId).not.toBe(b.familyId);
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('rotate', () => {
    it('yeni token üretir, aileyi korur ve eskisini replacedById ile işaretler', async () => {
      const { store, service } = setup();
      const first = await service.issue(USER_ID, META);

      const second = await service.rotate(first.token, META);

      expect(second.token).not.toBe(first.token);
      expect(second.familyId).toBe(first.familyId);
      const rows = store.family(first.familyId);
      const oldRow = rows.find(
        (r) => r.tokenHash === hashRefreshToken(first.token),
      )!;
      const newRow = rows.find(
        (r) => r.tokenHash === hashRefreshToken(second.token),
      )!;
      expect(oldRow.replacedById).toBe(newRow.id);
      expect(newRow.replacedById).toBeNull();
      expect(rows.every((r) => r.revokedAt === null)).toBe(true);
    });

    it('zincir halinde rotation çalışır', async () => {
      const { service } = setup();
      const first = await service.issue(USER_ID, META);

      const second = await service.rotate(first.token, META);
      const third = await service.rotate(second.token, META);

      expect(third.familyId).toBe(first.familyId);
    });

    it('kullanılmış token tekrar gelince tüm aileyi iptal eder', async () => {
      const { store, service } = setup();
      const first = await service.issue(USER_ID, META);
      const second = await service.rotate(first.token, META);

      await expect(service.rotate(first.token, META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );

      const rows = store.family(first.familyId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.revokedAt instanceof Date)).toBe(true);
      // log'da token ya da hash yok
      const logged = (warn.mock.calls as unknown[][])
        .map((c) => String(c[0]))
        .join('\n');
      expect(logged).not.toContain(first.token);
      expect(logged).not.toContain(hashRefreshToken(first.token));
      // ailenin en güncel token'ı da artık kullanılamaz
      await expect(service.rotate(second.token, META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('iptal edilmiş token gelince tüm aileyi iptal eder', async () => {
      const { store, service } = setup();
      const first = await service.issue(USER_ID, META);
      const second = await service.rotate(first.token, META);
      const oldRow = store
        .family(first.familyId)
        .find((r) => r.tokenHash === hashRefreshToken(second.token))!;
      oldRow.revokedAt = new Date();

      await expect(service.rotate(second.token, META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(
        store.family(first.familyId).every((r) => r.revokedAt instanceof Date),
      ).toBe(true);
    });

    it('başka ailelere dokunmaz', async () => {
      const { store, service } = setup();
      const victim = await service.issue(USER_ID, META);
      const other = await service.issue(USER_ID, META);
      await service.rotate(victim.token, META);

      await expect(service.rotate(victim.token, META)).rejects.toThrow();

      expect(
        store.family(other.familyId).every((r) => r.revokedAt === null),
      ).toBe(true);
      await expect(service.rotate(other.token, META)).resolves.toBeDefined();
    });

    it('bilinmeyen token reddedilir, hiçbir şey iptal edilmez', async () => {
      const { store, service } = setup();
      const issued = await service.issue(USER_ID, META);

      await expect(service.rotate('bilinmeyen', META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(store.family(issued.familyId)[0].revokedAt).toBeNull();
    });

    it('süresi dolmuş token reddedilir', async () => {
      const { store, service } = setup();
      const issued = await service.issue(USER_ID, META);
      store.family(issued.familyId)[0].expiresAt = new Date(Date.now() - 1000);

      await expect(service.rotate(issued.token, META)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('eşzamanlı iki rotation’dan yalnız biri kazanır; kaybeden tekrar kullanım sayılır ve aile iptal edilir', async () => {
      const { store, service } = setup();
      const issued = await service.issue(USER_ID, META);

      const results = await Promise.allSettled([
        service.rotate(issued.token, META),
        service.rotate(issued.token, META),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(InvalidRefreshTokenError);
      // kaybedenin eklediği token geri alındı; ailede 2 satır var, hepsi iptal
      const rows = store.family(issued.familyId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.revokedAt instanceof Date)).toBe(true);
    });
  });

  describe('revokeFamilyOf', () => {
    it('token’ın ailesini iptal eder', async () => {
      const { store, service } = setup();
      const first = await service.issue(USER_ID, META);
      await service.rotate(first.token, META);

      await service.revokeFamilyOf(first.token);

      expect(
        store.family(first.familyId).every((r) => r.revokedAt instanceof Date),
      ).toBe(true);
    });

    it('bilinmeyen token’da hata fırlatmaz', async () => {
      const { service } = setup();

      await expect(service.revokeFamilyOf('yok')).resolves.toBeUndefined();
    });
  });
});
