import { calculateRankLatest, RankHistoryPoint } from './rank-summary-calc';

const DATE = '2026-09-28';

/** `date - 30`'dan `date`'e 31 gün; varsayılan hepsi `null`, `overrides` ile ezilir. */
function history(
  overrides: Record<string, number | null> = {},
): RankHistoryPoint[] {
  const points: RankHistoryPoint[] = [];
  const start = new Date(`${DATE}T00:00:00Z`);
  for (let i = 30; i >= 0; i -= 1) {
    const d = new Date(start.getTime() - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    points.push({ date, position: overrides[date] ?? null });
  }
  return points;
}

describe('calculateRankLatest', () => {
  it('bugünün pozisyonunu ve sparkline ı history sırasıyla döner', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ [DATE]: 5 }),
      existingBestPosition: null,
    });
    expect(result.position).toBe(5);
    expect(result.sparkline).toHaveLength(30);
    expect(result.sparkline[29]).toBe(5);
  });

  it('previousPosition dünün pozisyonu', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ [DATE]: 5, '2026-09-27': 8 }),
      existingBestPosition: null,
    });
    expect(result.previousPosition).toBe(8);
  });

  it('change1d/7d/30d pozisyon farkı; negatif iyileşme demektir', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({
        [DATE]: 5,
        '2026-09-27': 8, // -3d -> -1 gün
        '2026-09-21': 10, // -7 gün
        '2026-08-29': 20, // -30 gün
      }),
      existingBestPosition: null,
    });
    expect(result.change1d).toBe(5 - 8);
    expect(result.change7d).toBe(5 - 10);
    expect(result.change30d).toBe(5 - 20);
  });

  it('karşılaştırılacak gün bulunamadıysa (null) değişim null döner', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ [DATE]: 5 }),
      existingBestPosition: null,
    });
    expect(result.change1d).toBeNull();
    expect(result.change7d).toBeNull();
    expect(result.change30d).toBeNull();
  });

  it('bugün bulunamadıysa (null) değişimler de null döner', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ '2026-09-27': 8 }),
      existingBestPosition: null,
    });
    expect(result.position).toBeNull();
    expect(result.change1d).toBeNull();
  });

  it('bestPosition pencere, önceki en iyi ve bugünün en küçüğü', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ [DATE]: 9, '2026-09-15': 4 }),
      existingBestPosition: 6,
    });
    expect(result.bestPosition).toBe(4);
  });

  it('bestPosition asla önceki en iyiden kötüleşmez', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history({ [DATE]: 15 }),
      existingBestPosition: 2,
    });
    expect(result.bestPosition).toBe(2);
  });

  it('hiç veri yoksa bestPosition null döner', () => {
    const result = calculateRankLatest({
      date: DATE,
      history: history(),
      existingBestPosition: null,
    });
    expect(result.bestPosition).toBeNull();
  });
});
