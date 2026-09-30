export class LocationReferenceDto {
  locationCode!: number;
  locationName!: string;
  languageCode!: string;
  languageName!: string;
}

export class LocationReferenceListResponseDto {
  items!: LocationReferenceDto[];
}
