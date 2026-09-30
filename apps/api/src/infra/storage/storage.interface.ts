import { Readable } from 'node:stream';

/**
 * ARCHITECTURE §3: Faz 1'de local disk, sonra S3 uyumlu bir implementasyona
 * geçilebilsin diye bu interface injection token'ıyla kullanılır.
 */
export interface StorageService {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
