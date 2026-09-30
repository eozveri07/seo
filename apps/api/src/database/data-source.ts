import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// src/database ve dist/database için aynı: apps/api kökü iki üst dizin.
const API_ROOT = join(__dirname, '..', '..');

/**
 * Uygulama (DatabaseModule) ve TypeORM CLI'nin ortak bağlantı ayarları.
 * Entity ve migration yolları derlenmiş dist çıktısını hedefler; CLI script'leri
 * önce `nest build` çalıştırır.
 */
export type PostgresDataSourceOptions = Extract<
  DataSourceOptions,
  { type: 'postgres' }
>;

export function buildDataSourceOptions(
  databaseUrl: string,
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', '**', '*.entity.js')],
    migrations: [join(__dirname, 'migrations', '*.js')],
  };
}

/**
 * CLI Nest ConfigModule'ü yüklemez. `.env` dosyaları ConfigModule'le aynı
 * sırayla okunur: önce apps/api/.env, sonra repo kökündeki .env. Önce okunan
 * ve process'te zaten tanımlı olan değerler ezilmez.
 */
function loadEnvFiles(): void {
  for (const file of [
    join(API_ROOT, '.env'),
    join(API_ROOT, '..', '..', '.env'),
  ]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

function requireDatabaseUrl(): string {
  loadEnvFiles();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL tanımlı değil. apps/api/.env ya da repo kökündeki .env dosyasına ekleyin (bkz. .env.example).',
    );
  }
  return databaseUrl;
}

// TypeORM CLI için: `typeorm -d dist/database/data-source.js <komut>`
export default new DataSource(buildDataSourceOptions(requireDatabaseUrl()));
