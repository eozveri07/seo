import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../cls-store';

/**
 * `fn`'i verilen organizasyonun tenant context'inde çalıştırır. Org'u
 * X-Org-Id'den gelmeyen ama güvenilir bir kaynaktan (davet token'ı, yeni
 * oluşturulan org) belirlenen akışlar içindir. İç context dıştakini miras
 * alır (userId, ip); orgId değişikliği dışarı sızmaz.
 */
export function runInTenant<T>(
  cls: ClsService<AppClsStore>,
  orgId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return cls.run({ ifNested: 'inherit' }, () => {
    cls.set('orgId', orgId);
    return fn();
  });
}
