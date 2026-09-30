import { applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { ORG_ID_SECURITY } from './tenant-context';

/** OpenAPI: endpoint hem Bearer token'ı hem X-Org-Id header'ını birlikte ister. */
export const ApiOrgScoped = (): MethodDecorator & ClassDecorator =>
  applyDecorators(ApiSecurity({ bearer: [], [ORG_ID_SECURITY]: [] }));
