import { ApiProperty } from '@nestjs/swagger';
import { RankSource } from '../entities/rank-daily.entity';

export class RankCheckNowResponseDto {
  /** `job_runs` kaydının id'si; sonuç bu kayıttan ve `rankings/serp`'ten izlenir. */
  runId!: string;
}

export class RankHistoryPointDto {
  @ApiProperty({ example: '2026-09-28' })
  date!: string;

  /** Organik sıra; depth içinde bulunamadıysa null. */
  @ApiProperty({ type: Number, nullable: true })
  position!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  rankAbsolute!: number | null;

  @ApiProperty({ type: String, nullable: true })
  url!: string | null;

  @ApiProperty({ enum: RankSource, enumName: 'RankSource' })
  source!: RankSource;
}

export class RankHistoryKeywordDto {
  trackedKeywordId!: string;
  /** Eskiden yeniye; sonucu olmayan günler yer almaz. */
  points!: RankHistoryPointDto[];
}

export class RankHistoryResponseDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  to!: string;

  /** İstekteki `keywordIds` sırasıyla. */
  keywords!: RankHistoryKeywordDto[];
}

export class RankCompetitorDto {
  domain!: string;
  /** Organik sıra (`rank_group`). */
  position!: number;
}

/** Bir keyword'ün bir günkü SERP'i (`rank_daily`). */
export class RankSerpResponseDto {
  trackedKeywordId!: string;

  @ApiProperty({ example: '2026-09-30' })
  date!: string;

  @ApiProperty({ type: Number, nullable: true })
  position!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  rankAbsolute!: number | null;

  @ApiProperty({ type: String, nullable: true })
  url!: string | null;

  /** Organik dışındaki SERP öğe tipleri, ör. `featured_snippet`. */
  serpFeatures!: string[];

  /** İlk 10 organik sonucun domain'i ve sırası. */
  competitorsTop!: RankCompetitorDto[];

  checkedAt!: Date;

  @ApiProperty({ enum: RankSource, enumName: 'RankSource' })
  source!: RankSource;
}
