import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        ...buildDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
        // true iken DataSource oluşturulur ama bağlanmaz (e2e testleri, openapi:export)
        manualInitialization:
          config.get('DATABASE_SKIP_INITIALIZATION', { infer: true }) === true,
      }),
    }),
  ],
})
export class DatabaseModule {}
