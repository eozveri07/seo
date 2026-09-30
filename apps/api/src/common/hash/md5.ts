import { createHash } from 'node:crypto';

/** `md5(text)` ile aynı sonuç (UTF-8, küçük harf hex). GSC ve GA4 hash kolonları bunu kullanır. */
export function md5(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}
