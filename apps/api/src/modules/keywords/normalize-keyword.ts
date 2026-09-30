/**
 * ARCHITECTURE §5.5: `keyword_normalized` = lower + trim + çoklu boşluğu
 * teke indirme. Unique kısıtın (project_id, keyword_normalized, device,
 * location_code, language_code) temeli; hem API'de hem bulk ekleme
 * içindeki tekrar tespitinde kullanılır.
 */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}
