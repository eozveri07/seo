import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { AppModule as AppModuleType } from '../src/app.module';
import type { configureApp as configureAppType } from '../src/configure-app';
import type { buildOpenApiDocument as buildOpenApiDocumentType } from '../src/swagger/build-openapi-document';

const PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: '3000',
  API_PREFIX: '/api/v1',
  PANEL_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  REDIS_URL: 'redis://localhost:6379',
};

for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

async function main(): Promise<void> {
  // Swagger CLI plugin sadece "nest build" ile derlenen koda uygulanır, bu yüzden
  // derlenmiş dist çıktısı burada, env yer tutucuları atandıktan sonra yüklenir;
  // typecheck ise src üzerinden yapılır.
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
  const { AppModule } = require('../dist/app.module') as { AppModule: typeof AppModuleType };
  const { configureApp } = require('../dist/configure-app') as {
    configureApp: typeof configureAppType;
  };
  const { buildOpenApiDocument } = require('../dist/swagger/build-openapi-document') as {
    buildOpenApiDocument: typeof buildOpenApiDocumentType;
  };
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });
  configureApp(app);
  await app.init();

  const document = buildOpenApiDocument(app);
  const outPath = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');

  await app.close();

  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec ${outPath} dosyasına yazıldı.`);
}

void main();
