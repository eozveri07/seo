import { Module } from '@nestjs/common';
import { KEY_VALUE_CACHE } from './key-value-cache';
import { RedisKeyValueCache } from './redis-key-value-cache';

@Module({
  providers: [{ provide: KEY_VALUE_CACHE, useClass: RedisKeyValueCache }],
  exports: [KEY_VALUE_CACHE],
})
export class CacheModule {}
