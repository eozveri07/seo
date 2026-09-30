const TURKISH_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 60;

/** Addan URL'de kullanılabilecek kısa ad üretir: `Acme Ajans Ş.` → `acme-ajans-s`. */
export function slugify(name: string): string {
  const slug = name
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (char) => TURKISH_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'org';
}
