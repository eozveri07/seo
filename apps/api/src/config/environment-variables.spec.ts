import { validate } from './environment-variables';

const VALID_ENV = {
  NODE_ENV: 'development',
  PANEL_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://seo:seo@localhost:5432/seo',
  REDIS_URL: 'redis://localhost:6379',
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
});
