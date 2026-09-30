import { KeyValueCache } from './key-value-cache';

/** Test ve Redis'siz ortamlar için süreli bellek içi cache. */
export class InMemoryKeyValueCache implements KeyValueCache {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(...keys: string[]): Promise<void> {
    keys.forEach((key) => this.entries.delete(key));
    return Promise.resolve();
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
