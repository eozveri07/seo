import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable({ scope: Scope.DEFAULT })
export class AppLogger extends ConsoleLogger {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private withRequestId(message: unknown): unknown {
    if (typeof message !== 'string') {
      return message;
    }
    const requestId = this.cls.isActive() ? this.cls.getId() : undefined;
    return requestId ? `[reqId:${requestId}] ${message}` : message;
  }

  log(message: unknown, ...rest: unknown[]): void {
    super.log(this.withRequestId(message), ...rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    super.error(this.withRequestId(message), ...rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    super.warn(this.withRequestId(message), ...rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    super.debug(this.withRequestId(message), ...rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(this.withRequestId(message), ...rest);
  }
}
