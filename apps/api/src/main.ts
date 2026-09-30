import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { configureApp } from './configure-app';
import { Environment } from './config/environment-variables';
import { setupSwagger } from './swagger/build-openapi-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));

  const configService = configureApp(app);

  if (
    configService.get('NODE_ENV', { infer: true }) === Environment.Development
  ) {
    setupSwagger(app);
  }

  await app.listen(configService.get('PORT', { infer: true }));
}

void bootstrap();
