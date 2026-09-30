import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RequestContextModule } from './cls.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { AppLogger } from './logger/app-logger.service';

@Module({
  imports: [RequestContextModule],
  providers: [
    AppLogger,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
  exports: [AppLogger],
})
export class CommonModule {}
