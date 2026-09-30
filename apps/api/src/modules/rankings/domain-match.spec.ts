import { matchesProjectDomain, normalizeHost } from './domain-match';

describe('matchesProjectDomain', () => {
  it.each([
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['example.com', 'www.example.com'],
    ['blog.example.com', 'example.com'],
    ['a.b.example.com', 'example.com'],
    ['www.blog.example.com', 'example.com'],
    ['https://example.com/', 'example.com'],
    ['http://www.example.com/fiyatlar/', 'example.com'],
    ['https://blog.example.com/yazi?x=1#y', 'example.com'],
    ['example.com/', 'example.com/'],
    ['EXAMPLE.com', 'Example.COM'],
    ['example.com.', 'example.com'],
    ['https://example.com:8443/a', 'example.com'],
    ['blog.example.com', 'https://www.example.com/'],
  ])('%s, %s ile eşleşir', (candidate, projectDomain) => {
    expect(matchesProjectDomain(candidate, projectDomain)).toBe(true);
  });

  it.each([
    ['notexample.com', 'example.com'],
    ['www.notexample.com', 'example.com'],
    ['https://myexample.com/', 'example.com'],
    ['example.com.tr', 'example.com'],
    ['example.co', 'example.com'],
    ['example.com.evil.net', 'example.com'],
    // Proje subdomain ise üst domain onun sonucu sayılmaz.
    ['example.com', 'blog.example.com'],
    ['shop.example.com', 'blog.example.com'],
    ['', 'example.com'],
    [null, 'example.com'],
    [undefined, 'example.com'],
  ])('%s, %s ile eşleşmez', (candidate, projectDomain) => {
    expect(matchesProjectDomain(candidate, projectDomain)).toBe(false);
  });

  it("proje subdomain ise yalnız kendisi ve alt subdomain'leri eşleşir", () => {
    expect(matchesProjectDomain('blog.example.com', 'blog.example.com')).toBe(
      true,
    );
    expect(
      matchesProjectDomain('tr.blog.example.com', 'blog.example.com'),
    ).toBe(true);
  });
});

describe('normalizeHost', () => {
  it('protokol, www, port, path ve sondaki noktayı atar', () => {
    expect(normalizeHost('HTTPS://www.Example.com:443/a/b?c#d')).toBe(
      'example.com',
    );
    expect(normalizeHost('//www.example.com/')).toBe('example.com');
    expect(normalizeHost('example.com.')).toBe('example.com');
  });

  it('host yoksa null döner', () => {
    expect(normalizeHost('https:///')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
  });
});
