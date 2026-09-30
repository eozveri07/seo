import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  DecryptionFailedError,
  InvalidCiphertextFormatError,
  UnknownEncryptionKeyVersionError,
} from './crypto.errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * ARCHITECTURE §13: secret'lar AES-256-GCM ile şifrelenir. Format
 * `v1:{iv}:{tag}:{ciphertext}` (her parça base64). Önek anahtar sürümünü
 * taşır; çözme, öneke göre doğru anahtarı seçer, bilinmeyen önekte hata
 * fırlatır. Düz metin ve anahtar hiçbir zaman loglanmaz.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly keyVersion: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const encryptionKey: string = configService.get('ENCRYPTION_KEY', {
      infer: true,
    });
    this.key = Buffer.from(encryptionKey, 'base64');
    this.keyVersion =
      configService.get('ENCRYPTION_KEY_VERSION', { infer: true }) ?? 'v1';
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      this.keyVersion,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new InvalidCiphertextFormatError();
    }
    const [version, ivBase64, tagBase64, ciphertextBase64] = parts;
    if (version !== this.keyVersion) {
      throw new UnknownEncryptionKeyVersionError(version);
    }

    try {
      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      const ciphertext = Buffer.from(ciphertextBase64, 'base64');
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new DecryptionFailedError();
    }
  }
}
