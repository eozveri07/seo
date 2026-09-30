import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('argon2id hash üretir ve doğru şifreyi doğrular', async () => {
    const hash = await hasher.hash('dogru-sifre-123');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(hash, 'dogru-sifre-123')).resolves.toBe(true);
  });

  it('yanlış şifrede false döner', async () => {
    const hash = await hasher.hash('dogru-sifre-123');

    await expect(hasher.verify(hash, 'yanlis-sifre')).resolves.toBe(false);
  });

  it('bozuk hash biçiminde hata fırlatmaz, false döner', async () => {
    await expect(hasher.verify('bozuk-hash', 'x')).resolves.toBe(false);
  });

  it('verifyDummy hata fırlatmadan tamamlanır', async () => {
    await expect(hasher.verifyDummy('herhangi')).resolves.toBeUndefined();
  });
});
