export class KeywordSuggestionDto {
  query!: string;
  impressions!: number;
  clicks!: number;
  ctr!: number;
  position!: number;
}

export class KeywordSuggestionsResponseDto {
  /** Öneri hesaplanan pencere. */
  from!: string;
  to!: string;
  items!: KeywordSuggestionDto[];
}
