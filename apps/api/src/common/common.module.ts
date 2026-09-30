import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RequestContextModule } from './cls.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { AppLogger } from './logger/app-logger.service';

@Module({
  imports: [RequestContextModule, EventEmitterModule.forRoot()],
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
