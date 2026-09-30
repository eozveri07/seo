import { Injectable } from '@nestjs/common';
import { DATAFORSEO_LOCATIONS } from './dataforseo-locations';

@Injectable()
export class LocationsService {
  list() {
    return DATAFORSEO_LOCATIONS;
  }
}
