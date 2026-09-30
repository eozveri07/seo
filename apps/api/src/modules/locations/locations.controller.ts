import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipTenant } from '../../common/tenancy/skip-tenant.decorator';
import { LocationReferenceListResponseDto } from './dto/location-reference.dto';
import { LocationsService } from './locations.service';

/** DataForSEO lokasyon/dil referansı (panel seçicisi için); org seçimi gerektirmez. */
@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @SkipTenant()
  @ApiBearerAuth()
  @ApiOkResponse({ type: LocationReferenceListResponseDto })
  list(): LocationReferenceListResponseDto {
    return { items: [...this.locationsService.list()] };
  }
}
