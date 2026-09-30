import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** argon2id; parametreler paketin güncel varsayılanları (m=64 MiB, t=3, p=4). */
@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // bozuk ya da tanınmayan hash biçimi: eşleşmiyor say
      return false;
    }
  }

  /**
   * Kullanıcı bulunamadığında da bir argon2 doğrulaması yapar; böylece
   * bilinmeyen e-posta ile yanlış şifre yanıt süresinden ayırt edilemez.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64'));
    await this.verify(await this.dummyHash, password);
  }
}
