export class Ga4SyncResponseDto {
  /** `job_runs` kaydının id'si; durum bu kayıttan izlenir. */
  runId!: string;
}

export class Ga4TotalsDto {
  sessions!: number;
  engagedSessions!: number;
  keyEvents!: number;
  totalRevenue!: number;
}

/** Kanal grubu (`sessionDefaultChannelGroup`) başına toplam (ARCHITECTURE §5.4). */
export class Ga4ChannelTotalsDto extends Ga4TotalsDto {
  channelGroup!: string;
}

/** `ga4_daily`'den kanal kırılımlı toplam (PLAN T1.6). */
export class Ga4OverviewResponseDto {
  from!: string;
  to!: string;
  totals!: Ga4TotalsDto;
  channels!: Ga4ChannelTotalsDto[];
}

export class Ga4LandingPageRowDto extends Ga4TotalsDto {
  /** `md5(landingPage)`. */
  landingPageHash!: string;
  landingPage!: string;
}

export class Ga4LandingPageListResponseDto {
  items!: Ga4LandingPageRowDto[];
  total!: number;
  page!: number;
  limit!: number;
}
