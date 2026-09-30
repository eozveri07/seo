import { addDays } from '../../common/dates/utc-date';

export interface RankHistoryPoint {
  /** YYYY-MM-DD. */
  date: string;
  position: number | null;
}

export interface RankLatestCalcInput {
  /** Hesabın yapıldığı gün (`keyword_rank_latest.position` bu güne ait olur). */
  date: string;
  /**
   * `date - 30`'dan `date`'e (dahil, 31 gün) artan sırada; her gün için bir
   * giriş, veri yoksa `position: null`. İlk gün (`date - 30`) yalnız
   * `change30d` için kullanılır; `sparkline` son 30 günü (`date - 29..date`) içerir.
   */
  history: RankHistoryPoint[];
  /** `keyword_rank_latest.best_position`'ın önceki değeri; hiç yoksa `null`. */
  existingBestPosition: number | null;
}

export interface RankLatestCalcResult {
  position: number | null;
  previousPosition: number | null;
  /** `position - (date - N gün önceki pozisyon)`; negatif iyileşme demektir. */
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  bestPosition: number | null;
  /** Son 30 gün, eskiden yeniye; `history` ile aynı sırada. */
  sparkline: (number | null)[];
}

/**
 * `keyword_rank_latest` güncellemesi (ARCHITECTURE §5.5, §10): saf hesap,
 * DB'siz test edilebilir. `change`'ler pozisyon farkı: negatif değer
 * iyileşme (pozisyon sayısı küçüldü), pozitif değer düşüş demektir. İki
 * uçtan biri `null` (bulunamadı ya da o gün veri yok) ise değişim `null`
 * döner. `bestPosition` hiç küçülmez: önceki en iyi, pencere içindeki en
 * iyi ve bugünün pozisyonundan en küçüğü (null'lar yok sayılır).
 */
export function calculateRankLatest(
  input: RankLatestCalcInput,
): RankLatestCalcResult {
  const byDate = new Map(
    input.history.map((point) => [point.date, point.position]),
  );
  const position = byDate.get(input.date) ?? null;

  const changeFromDaysAgo = (days: number): number | null => {
    const past = byDate.get(addDays(input.date, -days)) ?? null;
    return position !== null && past !== null ? position - past : null;
  };

  const sparklineStart = addDays(input.date, -29);
  const sparklinePoints = input.history.filter(
    (point) => point.date >= sparklineStart,
  );
  const windowPositions = sparklinePoints
    .map((point) => point.position)
    .filter((value): value is number => value !== null);
  const windowBest =
    windowPositions.length > 0 ? Math.min(...windowPositions) : null;
  const bestPosition = minIgnoringNull(
    input.existingBestPosition,
    windowBest,
    position,
  );

  return {
    position,
    previousPosition: byDate.get(addDays(input.date, -1)) ?? null,
    change1d: changeFromDaysAgo(1),
    change7d: changeFromDaysAgo(7),
    change30d: changeFromDaysAgo(30),
    bestPosition,
    sparkline: sparklinePoints.map((point) => point.position),
  };
}

function minIgnoringNull(...values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.min(...present) : null;
}
