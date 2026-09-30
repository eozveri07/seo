import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ClientsModule } from '../clients/clients.module';
import { KeywordGroup } from './entities/keyword-group.entity';
import { TrackedKeyword } from './entities/tracked-keyword.entity';
import { KeywordGroupsService } from './keyword-groups.service';
import { KeywordSuggestionsService } from './keyword-suggestions.service';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';
import { KeywordVolumeService } from './keyword-volume.service';
import { KeywordsBulkService } from './keywords-bulk.service';
import { RankableKeywordsService } from './rankable-keywords.service';
import { TrackedKeywordsService } from './tracked-keywords.service';

/**
 * API (CRUD, bulk, öneriler), worker (keyword-volume processor, dispatch
 * kaynağı) ve rank tracking'in (`RankableKeywordsService`) ortak kullandığı
 * keyword servisleri. HTTP katmanı içermez.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KeywordGroup, TrackedKeyword]),
    QueueModule,
    ConnectorsModule,
    ClientsModule,
    AuditLogsModule,
  ],
  providers: [
    provideTenantRepository(KeywordGroup),
    provideTenantRepository(TrackedKeyword),
    KeywordGroupsService,
    TrackedKeywordsService,
    KeywordsBulkService,
    KeywordSuggestionsService,
    KeywordVolumeJobsService,
    KeywordVolumeService,
    RankableKeywordsService,
  ],
  exports: [
    KeywordGroupsService,
    TrackedKeywordsService,
    KeywordsBulkService,
    KeywordSuggestionsService,
    KeywordVolumeJobsService,
    KeywordVolumeService,
    RankableKeywordsService,
  ],
})
export class KeywordsSharedModule {}
