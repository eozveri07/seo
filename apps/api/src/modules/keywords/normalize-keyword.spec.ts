import { normalizeKeyword } from './normalize-keyword';

describe('normalizeKeyword', () => {
  it('küçük harfe çevirir', () => {
    expect(normalizeKeyword('SEO Otomasyonu')).toBe('seo otomasyonu');
  });

  it('baştaki ve sondaki boşlukları kırpar', () => {
    expect(normalizeKeyword('  seo otomasyonu  ')).toBe('seo otomasyonu');
  });

  it('birden fazla boşluğu teke indirir', () => {
    expect(normalizeKeyword('seo   otomasyonu   aracı')).toBe(
      'seo otomasyonu aracı',
    );
  });

  it('tab ve satır sonu gibi boşlukları da teke indirir', () => {
    expect(normalizeKeyword('seo\totomasyonu\n aracı')).toBe(
      'seo otomasyonu aracı',
    );
  });

  it('zaten normalize bir keyword’ü değiştirmez', () => {
    expect(normalizeKeyword('seo otomasyonu')).toBe('seo otomasyonu');
  });

  it('farklı büyük/küçük ve boşluklu iki yazım aynı normalize sonucu üretir', () => {
    expect(normalizeKeyword(' SEO  Otomasyonu ')).toBe(
      normalizeKeyword('seo otomasyonu'),
    );
  });
});
