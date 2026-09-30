import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { WebhookRequestFailedError } from './webhook.errors';
import {
  isBlockedIpAddress,
  isBlockedWebhookHostname,
} from './webhook-address-guard';

/** Host'u tüm adreslerine çözümler (`dns.lookup(host, { all: true })`). */
export type WebhookLookupFn = (hostname: string) => Promise<string[]>;

export interface WebhookClientOptions {
  fetchFn?: typeof fetch;
  lookupFn?: WebhookLookupFn;
}

const defaultLookup: WebhookLookupFn = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

/**
 * Discord/Slack bildirim kanallarının paylaştığı basit webhook POST'u
 * (ARCHITECTURE §11). URL asla loglanmaz (secret sayılır).
 *
 * SSRF koruması: gönderimden hemen önce host DNS ile çözümlenir; adreslerden
 * biri dahili/özel aralıktaysa istek atılmaz. Yönlendirmeler takip edilmez,
 * 3xx yanıt hata sayılır.
 */
@Injectable()
export class WebhookClient {
  private readonly fetchFn: typeof fetch;
  private readonly lookupFn: WebhookLookupFn;

  constructor(options: WebhookClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.lookupFn = options.lookupFn ?? defaultLookup;
  }

  async post(url: string, body: unknown): Promise<void> {
    await this.assertPublicDestination(url);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'manual',
      });
    } catch (error) {
      throw new WebhookRequestFailedError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new WebhookRequestFailedError(
        `HTTP ${response.status}: yönlendirmeler takip edilmez.`,
      );
    }
    if (!response.ok) {
      throw new WebhookRequestFailedError(
        `HTTP ${response.status}: ${await safeText(response)}`,
      );
    }
  }

  private async assertPublicDestination(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new WebhookRequestFailedError('Webhook URL geçersiz.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new WebhookRequestFailedError('Webhook URL şeması desteklenmiyor.');
    }
    if (isBlockedWebhookHostname(parsed.hostname)) {
      throw new WebhookRequestFailedError(
        'Webhook hedefi dahili ya da özel bir adres.',
      );
    }

    let addresses: string[];
    try {
      addresses = await this.lookupFn(parsed.hostname);
    } catch (error) {
      throw new WebhookRequestFailedError(
        `Webhook host'u çözümlenemedi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (addresses.length === 0 || addresses.some(isBlockedIpAddress)) {
      throw new WebhookRequestFailedError(
        'Webhook hedefi dahili ya da özel bir adrese çözümleniyor.',
      );
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}
