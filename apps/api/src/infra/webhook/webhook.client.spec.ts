import { WebhookClient } from './webhook.client';
import { WebhookRequestFailedError } from './webhook.errors';

function response(ok: boolean, status = 200, text = ''): Response {
  return { ok, status, text: () => Promise.resolve(text) } as Response;
}

describe('WebhookClient.post', () => {
  it('2xx yanıtta başarıyla döner', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(true));
    const client = new WebhookClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.post('https://example.com/hook', { content: 'merhaba' });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'merhaba' }),
      }),
    );
  });

  it('2xx dışı yanıtta hata fırlatır', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(false, 500, 'boom'));
    const client = new WebhookClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.post('https://example.com/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
  });

  it('ağ hatasında hata fırlatır', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new WebhookClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.post('https://example.com/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
  });
});
