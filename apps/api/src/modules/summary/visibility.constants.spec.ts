import {
  computeVisibilityScore,
  CTR_BEYOND_TOP_10,
  CTR_CURVE,
  CTR_NOT_FOUND,
  ctrForPosition,
} from './visibility.constants';

describe('ctrForPosition', () => {
  it('pozisyon 1-10 için eğri değerini döner', () => {
    expect(ctrForPosition(1)).toBe(CTR_CURVE[1]);
    expect(ctrForPosition(10)).toBe(CTR_CURVE[10]);
  });

  it('11-20 arası için sabit düşük CTR döner', () => {
    expect(ctrForPosition(15)).toBe(CTR_BEYOND_TOP_10);
    expect(ctrForPosition(20)).toBe(CTR_BEYOND_TOP_10);
  });

  it('null (bulunamadı) için 0 döner', () => {
    expect(ctrForPosition(null)).toBe(CTR_NOT_FOUND);
  });

  it('1 den küçük ya da geçersiz pozisyon için 0 döner', () => {
    expect(ctrForPosition(0)).toBe(CTR_NOT_FOUND);
    expect(ctrForPosition(-3)).toBe(CTR_NOT_FOUND);
  });
});

describe('computeVisibilityScore', () => {
  it('boş listede 0 döner', () => {
    expect(computeVisibilityScore([])).toBe(0);
  });

  it('tüm keyword ler 1. sırada ise 100 döner', () => {
    expect(computeVisibilityScore([1, 1, 1])).toBe(100);
  });

  it('hiçbir keyword bulunamazsa 0 döner', () => {
    expect(computeVisibilityScore([null, null])).toBe(0);
  });

  it('0-100 aralığında kalır', () => {
    for (const positions of [[1], [50], [null, 1, 100], [3, 7, null, 12]]) {
      const score = computeVisibilityScore(positions);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('daha iyi pozisyonlar daha yüksek skor verir', () => {
    const better = computeVisibilityScore([1, 2, 3]);
    const worse = computeVisibilityScore([18, 25, 40]);
    expect(better).toBeGreaterThan(worse);
  });

  it('karışık pozisyonlarda ara bir skor verir', () => {
    const score = computeVisibilityScore([1, null, 5]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
