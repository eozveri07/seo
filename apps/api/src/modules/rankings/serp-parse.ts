import { DfsSerpAdvancedResult } from '../../connectors/dataforseo/dataforseo.types';
import { matchesProjectDomain, normalizeHost } from './domain-match';
import { RankCompetitor } from './entities/rank-daily.entity';

/** `competitors_top`'a girecek organik sonuç sayısı (ARCHITECTURE §5.5). */
export const COMPETITORS_TOP_SIZE = 10;

const ORGANIC = 'organic';

/** Bir SERP'ten `rank_daily`'ye yazılacak alanlar. */
export interface ParsedRank {
  /** Organik sıra (`rank_group`); depth içinde yoksa null. */
  position: number | null;
  rankAbsolute: number | null;
  url: string | null;
  /** Organik dışındaki SERP öğe tipleri (featured_snippet, people_also_ask...). */
  serpFeatures: string[];
  competitorsTop: RankCompetitor[];
}

/**
 * ARCHITECTURE §9.3: organik öğelerde proje domain'i aranır (subdomain dahil,
 * `www` normalize); ilk eşleşmenin `rank_group`'u `position`, `rank_absolute`'u
 * `rank_absolute` olur. Organik olmayan öğeler (featured snippet dahil)
 * pozisyon sayılmaz, `serp_features`'a girer.
 */
export function parseSerp(
  result: DfsSerpAdvancedResult,
  projectDomain: string,
): ParsedRank {
  const organic = result.items
    .filter((item) => item.type === ORGANIC && item.rankGroup !== null)
    .sort((a, b) => (a.rankGroup ?? 0) - (b.rankGroup ?? 0));

  const match = organic.find((item) =>
    matchesProjectDomain(item.domain ?? item.url, projectDomain),
  );

  const itemTypes =
    result.itemTypes.length > 0
      ? result.itemTypes
      : result.items.map((item) => item.type);
  const serpFeatures = [...new Set(itemTypes)].filter(
    (type) => type !== ORGANIC,
  );

  const competitorsTop: RankCompetitor[] = [];
  for (const item of organic) {
    if (competitorsTop.length >= COMPETITORS_TOP_SIZE) {
      break;
    }
    const domain = item.domain ?? normalizeHost(item.url);
    if (domain && item.rankGroup !== null) {
      competitorsTop.push({ domain, position: item.rankGroup });
    }
  }

  return {
    position: match?.rankGroup ?? null,
    rankAbsolute: match?.rankAbsolute ?? null,
    url: match?.url ?? null,
    serpFeatures,
    competitorsTop,
  };
}
