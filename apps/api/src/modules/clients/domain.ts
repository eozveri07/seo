/**
 * Proje domain normalizasyonu (ARCHITECTURE §5.2, CLAUDE.md): protokol, `www.`,
 * path/query/fragment ve sondaki slash atılır, sonuç lowercase'tir.
 * `(org_id, domain)` unique kısıtı ve izolasyon bu normalize edilmiş değer
 * üzerinden çalışır.
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^www\./, '');
  value = value.split(/[/?#]/)[0];
  return value;
}
