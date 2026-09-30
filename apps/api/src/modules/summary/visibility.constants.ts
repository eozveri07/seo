/**
 * Visibility skoru (ARCHITECTURE §5.6, §10): takip edilen keyword'lerin
 * pozisyonuna göre CTR eğrisiyle ağırlıklandırılmış, 0-100 arası bir skor.
 * CTR eğrisi sabitleri tek yerde (T1.10): endüstri ortalamalarına yakın,
 * organik CTR yüzdeleri (pozisyon 1-10).
 *
 * Faz 1'de her keyword eşit ağırlıklıdır (`search_volume` ağırlıklandırması
 * yok): rankings modülü yalnız `rank_daily`'yi okur, keyword hacmine erişim
 * modül sınırını (CLAUDE.md kural 1) gereksiz yere genişletirdi. Faz 2'de
 * gerekirse ağırlık eklenir.
 */
export const CTR_CURVE: Readonly<Record<number, number>> = Object.freeze({
  1: 0.316,
  2: 0.157,
  3: 0.105,
  4: 0.073,
  5: 0.053,
  6: 0.04,
  7: 0.031,
  8: 0.025,
  9: 0.02,
  10: 0.017,
});

/** 11-20. sayfa sonuçları (top 20 içinde ama top 10 dışında) için sabit düşük CTR. */
export const CTR_BEYOND_TOP_10 = 0.005;

/** Bulunamayan (depth dışı ya da hiç kontrol edilmemiş) keyword: görünürlük yok. */
export const CTR_NOT_FOUND = 0;

/** Bir pozisyonun CTR eğrisindeki karşılığı. */
export function ctrForPosition(position: number | null): number {
  if (position === null || !Number.isFinite(position) || position < 1) {
    return CTR_NOT_FOUND;
  }
  const rounded = Math.round(position);
  if (rounded <= 10) {
    return CTR_CURVE[rounded] ?? CTR_BEYOND_TOP_10;
  }
  return CTR_BEYOND_TOP_10;
}

/**
 * Visibility skoru: pozisyonların CTR'larının, pozisyon 1'in CTR'ına oranı
 * (yüzde). Tüm keyword'ler 1. sırada olsaydı skor 100 olurdu; hiçbiri
 * bulunamazsa 0 olur. Boş liste 0 döner.
 */
export function computeVisibilityScore(positions: (number | null)[]): number {
  if (positions.length === 0) {
    return 0;
  }
  const bestCtr: number = CTR_CURVE[1];
  let totalCtr = 0;
  for (const position of positions) {
    totalCtr += ctrForPosition(position);
  }
  const score = (totalCtr / positions.length / bestCtr) * 100;
  return clamp(Math.round(score * 100) / 100, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
