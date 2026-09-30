import { Module } from '@nestjs/common';
import { KeywordGroupsController } from './keyword-groups.controller';
import { KeywordsSharedModule } from './keywords-shared.module';
import { TrackedKeywordsController } from './tracked-keywords.controller';

/** API: keyword grubu ve takip listesi CRUD'u, bulk ekleme, öneriler. */
@Module({
  imports: [KeywordsSharedModule],
  controllers: [KeywordGroupsController, TrackedKeywordsController],
})
export class KeywordsModule {}
