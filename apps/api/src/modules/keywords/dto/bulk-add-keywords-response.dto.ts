export class BulkAddKeywordsErrorDto {
  /** 1 tabanlı, boş satırlar dahil edilmeden orijinal metindeki satır no. */
  line!: number;
  message!: string;
}

export class BulkAddKeywordsResponseDto {
  added!: number;
  skipped!: number;
  errors!: BulkAddKeywordsErrorDto[];
}
