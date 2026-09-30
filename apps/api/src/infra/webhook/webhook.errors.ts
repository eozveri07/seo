/** Discord/Slack webhook isteği başarısız oldu (ağ hatası ya da 2xx dışı yanıt). */
export class WebhookRequestFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookRequestFailedError';
  }
}
