import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

const REQUEST_ID_HEADER = 'x-request-id';

function requestIdFromHeader(req: Request): string | undefined {
  const header = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => requestIdFromHeader(req) ?? uuidv7(),
        setup: (cls, req: Request, res: Response) => {
          res.setHeader('X-Request-Id', cls.getId());
          if (req.ip) {
            cls.set('ip', req.ip);
          }
        },
      },
    }),
  ],
  exports: [ClsModule],
})
export class RequestContextModule {}
