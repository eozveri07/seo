/** E-posta adresleri karşılaştırma ve kayıt için tek biçime getirilir. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
