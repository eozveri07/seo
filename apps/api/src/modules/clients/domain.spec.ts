import { normalizeDomain } from './domain';

describe('normalizeDomain', () => {
  it('protokolü atar', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com');
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  it('www. önekini atar', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('https://www.example.com')).toBe('example.com');
  });

  it('path, query ve fragment atar', () => {
    expect(normalizeDomain('example.com/path/to/page')).toBe('example.com');
    expect(normalizeDomain('example.com?q=1')).toBe('example.com');
    expect(normalizeDomain('example.com#section')).toBe('example.com');
  });

  it('sondaki slash atar', () => {
    expect(normalizeDomain('example.com/')).toBe('example.com');
    expect(normalizeDomain('https://example.com/')).toBe('example.com');
  });

  it('lowercase yapar', () => {
    expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    expect(normalizeDomain('Example.Com')).toBe('example.com');
  });

  it('protokol, www, path ve büyük harfi birlikte ele alır', () => {
    expect(normalizeDomain('  HTTPS://WWW.Example.COM/path/?x=1  ')).toBe(
      'example.com',
    );
  });

  it('baştaki/sondaki boşlukları kırpar', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com');
  });
});
