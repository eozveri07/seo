import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = '/api/v1';

  @IsString()
  @IsNotEmpty()
  PANEL_ORIGIN!: string;

  @IsOptional()
  @IsString()
  PANEL_URL?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_SECRET?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  JWT_ACCESS_TTL?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  REFRESH_TOKEN_TTL_DAYS?: number;

  @IsOptional()
  @IsString()
  REPORT_TOKEN_SECRET?: string;

  @IsOptional()
  @IsString()
  ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  ENCRYPTION_KEY_VERSION?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SA_JSON_BASE64?: string;

  @IsOptional()
  @IsString()
  DFS_LOGIN?: string;

  @IsOptional()
  @IsString()
  DFS_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  @IsOptional()
  @IsString()
  STORAGE_DIR?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : value,
  )
  @IsBoolean()
  SCHEDULER_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  WORKER_QUEUES?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const message = errors
      .map((error) => {
        const constraints = Object.values(error.constraints ?? {}).join(', ');
        return `${error.property}: ${constraints || 'geçersiz değer'}`;
      })
      .join('; ');
    throw new Error(`Ortam değişkenleri doğrulanamadı -> ${message}`);
  }

  return validatedConfig;
}
