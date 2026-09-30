import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  InvalidStorageKeyError,
  StorageObjectNotFoundError,
} from './storage.errors';
import { StorageService } from './storage.interface';

/**
 * ARCHITECTURE §3: Faz 1 storage implementasyonu, `STORAGE_DIR` altına
 * yazar. Key'ler her zaman `baseDir` içine çözülür; mutlak yol ya da `..`
 * ile üst dizine çıkan key'ler reddedilir.
 */
@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly baseDir: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.baseDir = resolve(
      configService.get('STORAGE_DIR', { infer: true }) ?? './storage',
    );
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    const path = this.resolvePath(key);
    try {
      return await readFile(path);
    } catch {
      throw new StorageObjectNotFoundError(key);
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolvePath(key);
    await rm(path, { force: true });
  }

  async getStream(key: string): Promise<Readable> {
    const path = this.resolvePath(key);
    try {
      await access(path);
    } catch {
      throw new StorageObjectNotFoundError(key);
    }
    return createReadStream(path);
  }

  private resolvePath(key: string): string {
    if (!key || isAbsolute(key)) {
      throw new InvalidStorageKeyError(key);
    }
    const resolvedPath = resolve(this.baseDir, key);
    const relativePath = relative(this.baseDir, resolvedPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new InvalidStorageKeyError(key);
    }
    return resolvedPath;
  }
}
