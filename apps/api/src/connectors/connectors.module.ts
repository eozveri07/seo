import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/environment-variables';
import { UsageModule } from '../modules/usage/usage.module';
import { UsageService } from '../modules/usage/usage.service';
import { DataForSeoClient } from './dataforseo/dataforseo.client';
import { Ga4Client } from './ga4/ga4.client';
import { GscClient } from './gsc/gsc.client';

/** ARCHITECTURE §9: dış API client'ları. İş mantığı içermez. */
@Module({
  imports: [UsageModule],
  providers: [
    GscClient,
    Ga4Client,
    {
      provide: DataForSeoClient,
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
        usageService: UsageService,
      ) => new DataForSeoClient(configService, usageService),
      inject: [ConfigService, UsageService],
    },
  ],
  exports: [GscClient, Ga4Client, DataForSeoClient],
})
export class ConnectorsModule {}
