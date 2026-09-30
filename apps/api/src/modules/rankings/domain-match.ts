/**
 * SERP öğesinin proje domain'ine ait olup olmadığı (ARCHITECTURE §9.3).
 * Subdomain'ler eşleşir (`blog.example.com` → `example.com`), `www.` her iki
 * tarafta da yok sayılır. Protokol, port, path, query ve sondaki nokta
 * karşılaştırmaya girmez. Etiket sınırına bakılır: `notexample.com`
 * `example.com` ile eşleşmez.
 */
export function matchesProjectDomain(
  candidate: string | null | undefined,
  projectDomain: string,
): boolean {
  const host = normalizeHost(candidate);
  const base = normalizeHost(projectDomain);
  if (!host || !base) {
    return false;
  }
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Domain ya da URL'den karşılaştırılabilir host: lowercase, protokolsüz,
 * `www.`'siz, portsuz, path'siz. Boş ya da host içermeyen girdide `null`.
 */
export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^\/\//, '');
  value = value.split(/[/?#]/)[0];
  // userinfo (`user@host`) ve port atılır.
  value = value.slice(value.lastIndexOf('@') + 1).replace(/:\d*$/, '');
  value = value.replace(/\.+$/, '');
  value = value.replace(/^www\./, '');
  return value.length > 0 ? value : null;
}
