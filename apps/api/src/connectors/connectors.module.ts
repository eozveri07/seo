import { Module } from '@nestjs/common';
import { Ga4Client } from './ga4/ga4.client';
import { GscClient } from './gsc/gsc.client';

/** ARCHITECTURE §9: dış API client'ları. İş mantığı içermez. */
@Module({
  providers: [GscClient, Ga4Client],
  exports: [GscClient, Ga4Client],
})
export class ConnectorsModule {}
