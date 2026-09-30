/** Kısa ömürlü anahtar-değer cache'i. Uygulamada Redis, testlerde bellek içi. */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

export const KEY_VALUE_CACHE = Symbol('KEY_VALUE_CACHE');
