/** Storage key'i güvenli değil: mutlak yol ya da `..` ile üst dizine çıkıyor. */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Geçersiz storage key: ${key}`);
    this.name = 'InvalidStorageKeyError';
  }
}

/** Verilen key ile eşleşen bir dosya yok. */
export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage nesnesi bulunamadı: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
