import { validate } from './environment-variables';

const VALID_ENV = {
  NODE_ENV: 'development',
  PANEL_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://seo:seo@localhost:5432/seo',
  REDIS_URL: 'redis://localhost:6379',
  ENCRYPTION_KEY: 'uwdVDa7iNK3qgjIKPO4eBy3UcXmr8/t5zLh8MTJI82g=',
  JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-chars',
  JWT_ACCESS_TTL: '900',
};

function withoutKey(key: keyof typeof VALID_ENV): Record<string, string> {
  const copy: Record<string, string> = { ...VALID_ENV };
  delete copy[key];
  return copy;
}

describe('validate', () => {
  it('geçerli env için doğrulanmış nesneyi döner ve varsayılanları uygular', () => {
    const result = validate({ ...VALID_ENV });

    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('/api/v1');
    expect(result.NODE_ENV).toBe('development');
  });

  it('DATABASE_URL eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('DATABASE_URL'))).toThrow(/DATABASE_URL/);
  });

  it('REDIS_URL eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('REDIS_URL'))).toThrow(/REDIS_URL/);
  });

  it('NODE_ENV geçersizse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate({ ...VALID_ENV, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('PANEL_ORIGIN eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('PANEL_ORIGIN'))).toThrow(/PANEL_ORIGIN/);
  });

  it('ENCRYPTION_KEY eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('ENCRYPTION_KEY'))).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('ENCRYPTION_KEY 32 byte uzunluğunda değilse hata fırlatır', () => {
    expect(() =>
      validate({
        ...VALID_ENV,
        ENCRYPTION_KEY: Buffer.from('kisa').toString('base64'),
      }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('JWT_ACCESS_SECRET eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('JWT_ACCESS_SECRET'))).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('JWT_ACCESS_SECRET 32 karakterden kısaysa hata fırlatır', () => {
    expect(() => validate({ ...VALID_ENV, JWT_ACCESS_SECRET: 'kisa' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('JWT_ACCESS_TTL eksikse değişken adını içeren bir hata fırlatır', () => {
    expect(() => validate(withoutKey('JWT_ACCESS_TTL'))).toThrow(
      /JWT_ACCESS_TTL/,
    );
  });

  it('JWT_ACCESS_TTL sayıya çevrilir, REFRESH_TOKEN_TTL_DAYS varsayılanı 30', () => {
    const result = validate({ ...VALID_ENV });

    expect(result.JWT_ACCESS_TTL).toBe(900);
    expect(result.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it.each(['DATABASE_SKIP_INITIALIZATION', 'SCHEDULER_ENABLED'])(
    "%s='false' false, 'true' true olarak okunur",
    (key) => {
      const off = validate({ ...VALID_ENV, [key]: 'false' });
      const on = validate({ ...VALID_ENV, [key]: 'true' });

      expect(off[key as keyof typeof off]).toBe(false);
      expect(on[key as keyof typeof on]).toBe(true);
    },
  );
});
