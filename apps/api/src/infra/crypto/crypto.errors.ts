/** Şifrelenmiş metin `v1:{iv}:{tag}:{ciphertext}` biçiminde değil. */
export class InvalidCiphertextFormatError extends Error {
  constructor() {
    super('Şifrelenmiş metin beklenen formatta değil.');
    this.name = 'InvalidCiphertextFormatError';
  }
}

/** Önek, `CryptoService`'in bildiği hiçbir anahtar sürümüyle eşleşmiyor. */
export class UnknownEncryptionKeyVersionError extends Error {
  constructor(version: string) {
    super(`Bilinmeyen şifreleme anahtarı sürümü: ${version}`);
    this.name = 'UnknownEncryptionKeyVersionError';
  }
}

/** Çözme başarısız: yanlış anahtar ya da bozuk IV/tag/ciphertext. */
export class DecryptionFailedError extends Error {
  constructor() {
    super('Şifre çözme başarısız.');
    this.name = 'DecryptionFailedError';
  }
}
