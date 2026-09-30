import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { validationExceptionFactory } from './common/validation-exception-factory';
import { EnvironmentVariables } from './config/environment-variables';

export function configureApp(
  app: NestExpressApplication,
): ConfigService<EnvironmentVariables, true> {
  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get('PANEL_ORIGIN', { infer: true }),
    credentials: true,
  });

  app.setGlobalPrefix(configService.get('API_PREFIX', { infer: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.enableShutdownHooks();

  return configService;
}
