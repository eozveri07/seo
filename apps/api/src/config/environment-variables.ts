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
  MinLength,
  ValidateBy,
  ValidationOptions,
  validateSync,
} from 'class-validator';

const ENCRYPTION_KEY_BYTE_LENGTH = 32;
const JWT_ACCESS_SECRET_MIN_LENGTH = 32;

/** `ENCRYPTION_KEY`'in base64 ile kodlanmış tam 32 byte olduğunu doğrular. */
function IsBase64EncryptionKey(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isBase64EncryptionKey',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string') {
            return false;
          }
          try {
            return (
              Buffer.from(value, 'base64').length === ENCRYPTION_KEY_BYTE_LENGTH
            );
          } catch {
            return false;
          }
        },
        defaultMessage: () =>
          `ENCRYPTION_KEY base64 ile kodlanmış ${ENCRYPTION_KEY_BYTE_LENGTH} byte olmalı`,
      },
    },
    validationOptions,
  );
}

/**
 * `enableImplicitConversion` string'i `Boolean('false') === true` ile önceden
 * çevirdiği için ham değer `obj[key]`'den okunur.
 */
function toBoolean({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown {
  const raw = obj[key];
  return typeof raw === 'string' ? raw === 'true' : raw;
}

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

  /** true iken TypeORM açılışta bağlanmaz; e2e testleri ve openapi:export DB'siz çalışır. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_SKIP_INITIALIZATION?: boolean;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  /** Access JWT imza anahtarı (HS256). En az 32 karakter. */
  @IsString()
  @IsNotEmpty()
  @MinLength(JWT_ACCESS_SECRET_MIN_LENGTH)
  JWT_ACCESS_SECRET!: string;

  /** Access JWT ömrü, saniye. ARCHITECTURE §4.4: 900 (15 dk). */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  @IsOptional()
  @IsString()
  REPORT_TOKEN_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  @IsBase64EncryptionKey()
  ENCRYPTION_KEY!: string;

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
  @Transform(toBoolean)
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
