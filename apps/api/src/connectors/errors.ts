/**
 * ARCHITECTURE §9: connector hataları dört sınıfa ayrılır. Çağıranlar
 * (verify, sync processor'ları) bu sınıflara göre davranır: `auth`/`permanent`
 * bağlantıyı `error`'a çeker, `quota`/`transient` exponential backoff ile
 * yeniden denenir.
 */
export type ConnectorErrorKind = 'auth' | 'quota' | 'transient' | 'permanent';

export abstract class ConnectorError extends Error {
  abstract readonly kind: ConnectorErrorKind;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Service account eksik/geçersiz ya da property'ye erişim yetkisi yok/kaldırıldı. */
export class ConnectorAuthError extends ConnectorError {
  readonly kind = 'auth' as const;
}

/** Rate limit (429). */
export class ConnectorQuotaError extends ConnectorError {
  readonly kind = 'quota' as const;
}

/** Geçici hata (5xx, ağ hatası); yeniden denenebilir. */
export class ConnectorTransientError extends ConnectorError {
  readonly kind = 'transient' as const;
}

/** Kalıcı hata (ör. property bulunamadı, geçersiz istek). */
export class ConnectorPermanentError extends ConnectorError {
  readonly kind = 'permanent' as const;
}
