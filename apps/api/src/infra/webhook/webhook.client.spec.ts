import { WebhookClient, WebhookLookupFn } from './webhook.client';
import { WebhookRequestFailedError } from './webhook.errors';

function response(ok: boolean, status = 200, text = ''): Response {
  return { ok, status, text: () => Promise.resolve(text) } as Response;
}

function buildClient(
  fetchFn: jest.Mock,
  lookupFn: WebhookLookupFn = () => Promise.resolve(['93.184.215.14']),
): WebhookClient {
  return new WebhookClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    lookupFn,
  });
}

describe('WebhookClient.post', () => {
  it('2xx yanıtta başarıyla döner', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(true));
    const client = buildClient(fetchFn);

    await client.post('https://example.com/hook', { content: 'merhaba' });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'merhaba' }),
        redirect: 'manual',
      }),
    );
  });

  it.each([
    'https://discord.com/api/webhooks/123/token',
    'https://hooks.slack.com/services/T000/B000/XXXX',
  ])('public host %s için gönderir', async (url) => {
    const fetchFn = jest.fn().mockResolvedValue(response(true, 204));
    const lookupFn = jest
      .fn()
      .mockResolvedValue(['162.159.128.233', '2606:4700::6810:84e5']);
    const client = buildClient(fetchFn, lookupFn);

    await client.post(url, {});

    expect(lookupFn).toHaveBeenCalledWith(new URL(url).hostname);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('2xx dışı yanıtta hata fırlatır', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(false, 500, 'boom'));
    const client = buildClient(fetchFn);

    await expect(client.post('https://example.com/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
  });

  it('3xx yanıtı hata sayar (yönlendirme takip edilmez)', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(false, 302));
    const client = buildClient(fetchFn);

    await expect(client.post('https://example.com/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('ağ hatasında hata fırlatır', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = buildClient(fetchFn);

    await expect(client.post('https://example.com/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
  ])('özel adrese (%s) çözümlenen alan adına istek atmaz', async (address) => {
    const fetchFn = jest.fn();
    const lookupFn = jest.fn().mockResolvedValue(['93.184.215.14', address]);
    const client = buildClient(fetchFn, lookupFn);

    await expect(client.post('https://evil.example/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
    expect(lookupFn).toHaveBeenCalledWith('evil.example');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    'https://localhost/hook',
    'https://127.0.0.1/hook',
    'http://169.254.169.254/latest/meta-data/',
    'https://[::1]/hook',
    'https://[::ffff:10.0.0.1]/hook',
  ])('literal dahili host %s için DNS ve istek yapmaz', async (url) => {
    const fetchFn = jest.fn();
    const lookupFn = jest.fn();
    const client = buildClient(fetchFn, lookupFn);

    await expect(client.post(url, {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
    expect(lookupFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('DNS çözümlemesi başarısız olursa istek atmaz', async () => {
    const fetchFn = jest.fn();
    const lookupFn = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const client = buildClient(fetchFn, lookupFn);

    await expect(client.post('https://nope.example/hook', {})).rejects.toThrow(
      WebhookRequestFailedError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
