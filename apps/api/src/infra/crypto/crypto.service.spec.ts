import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { CryptoService } from './crypto.service';
import {
  DecryptionFailedError,
  InvalidCiphertextFormatError,
  UnknownEncryptionKeyVersionError,
} from './crypto.errors';

const KEY = Buffer.alloc(32, 7).toString('base64');

function buildConfigService(
  overrides: Partial<
    Record<'ENCRYPTION_KEY' | 'ENCRYPTION_KEY_VERSION', string>
  > = {},
): ConfigService<EnvironmentVariables, true> {
  const values: Record<string, string> = {
    ENCRYPTION_KEY: KEY,
    ENCRYPTION_KEY_VERSION: 'v1',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as ConfigService<EnvironmentVariables, true>;
}

describe('CryptoService', () => {
  it('şifreler ve aynı metni çözer', () => {
    const service = new CryptoService(buildConfigService());

    const encrypted = service.encrypt('gizli-token');

    expect(encrypted).not.toContain('gizli-token');
    expect(service.decrypt(encrypted)).toBe('gizli-token');
  });

  it('format v1:{iv}:{tag}:{ciphertext} şeklindedir', () => {
    const service = new CryptoService(buildConfigService());

    const encrypted = service.encrypt('merhaba');
    const parts = encrypted.split(':');

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('aynı metin için her seferinde farklı IV üretir', () => {
    const service = new CryptoService(buildConfigService());

    const first = service.encrypt('aynı-metin');
    const second = service.encrypt('aynı-metin');

    expect(first).not.toBe(second);
    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
  });

  it('bozuk tag ile çözme DecryptionFailedError fırlatır', () => {
    const service = new CryptoService(buildConfigService());
    const encrypted = service.encrypt('metin');
    const [version, iv, , ciphertext] = encrypted.split(':');
    const tamperedTag = Buffer.alloc(16, 1).toString('base64');

    expect(() =>
      service.decrypt([version, iv, tamperedTag, ciphertext].join(':')),
    ).toThrow(DecryptionFailedError);
  });

  it('bozuk ciphertext ile çözme DecryptionFailedError fırlatır', () => {
    const service = new CryptoService(buildConfigService());
    const encrypted = service.encrypt('metin');
    const [version, iv, tag] = encrypted.split(':');
    const tamperedCiphertext = Buffer.from('bozuk-veri').toString('base64');

    expect(() =>
      service.decrypt([version, iv, tag, tamperedCiphertext].join(':')),
    ).toThrow(DecryptionFailedError);
  });

  it('yanlış anahtarla çözme DecryptionFailedError fırlatır', () => {
    const encrypted = new CryptoService(buildConfigService()).encrypt('metin');
    const otherKey = Buffer.alloc(32, 9).toString('base64');
    const serviceWithOtherKey = new CryptoService(
      buildConfigService({ ENCRYPTION_KEY: otherKey }),
    );

    expect(() => serviceWithOtherKey.decrypt(encrypted)).toThrow(
      DecryptionFailedError,
    );
  });

  it('bilinmeyen önekle çözme UnknownEncryptionKeyVersionError fırlatır', () => {
    const service = new CryptoService(buildConfigService());
    const encrypted = service.encrypt('metin');
    const withUnknownVersion = encrypted.replace(/^v1:/, 'v2:');

    expect(() => service.decrypt(withUnknownVersion)).toThrow(
      UnknownEncryptionKeyVersionError,
    );
  });

  it('geçersiz formatta InvalidCiphertextFormatError fırlatır', () => {
    const service = new CryptoService(buildConfigService());

    expect(() => service.decrypt('gecersiz-format')).toThrow(
      InvalidCiphertextFormatError,
    );
  });
});
