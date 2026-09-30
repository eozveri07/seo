import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { LocalDiskStorageService } from './local-disk-storage.service';
import {
  InvalidStorageKeyError,
  StorageObjectNotFoundError,
} from './storage.errors';

function buildConfigService(
  storageDir: string,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: () => storageDir,
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function readStreamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('LocalDiskStorageService', () => {
  let baseDir: string;
  let service: LocalDiskStorageService;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
    service = new LocalDiskStorageService(buildConfigService(baseDir));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('put ile yazdığını get ile okur', async () => {
    await service.put('reports/2026-01.pdf', Buffer.from('icerik'));

    const result = await service.get('reports/2026-01.pdf');

    expect(result.toString()).toBe('icerik');
  });

  it('getStream ile aynı içeriği stream olarak döner', async () => {
    await service.put('report.txt', Buffer.from('stream-icerik'));

    const stream = await service.getStream('report.txt');
    const result = await readStreamToBuffer(stream);

    expect(result.toString()).toBe('stream-icerik');
  });

  it('delete ile dosyayı siler', async () => {
    await service.put('to-delete.txt', Buffer.from('x'));

    await service.delete('to-delete.txt');

    await expect(service.get('to-delete.txt')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it('var olmayan key için get StorageObjectNotFoundError fırlatır', async () => {
    await expect(service.get('yok.txt')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it.each(['../secret.txt', '../../etc/passwd', 'a/../../b.txt'])(
    "%s gibi üst dizine çıkan key'leri reddeder",
    async (key) => {
      await expect(service.put(key, Buffer.from('x'))).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
    },
  );

  it("mutlak yol içeren key'i reddeder", async () => {
    await expect(
      service.put('/etc/passwd', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });
});
