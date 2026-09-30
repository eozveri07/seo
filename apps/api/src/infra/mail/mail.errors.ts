/** SMTP transport'una gönderim başarısız oldu. */
export class MailSendFailedError extends Error {
  constructor(cause: unknown) {
    super('E-posta gönderilemedi.');
    this.name = 'MailSendFailedError';
    this.cause = cause;
  }
}
