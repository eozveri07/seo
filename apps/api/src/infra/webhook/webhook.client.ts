import { Injectable } from '@nestjs/common';
import { WebhookRequestFailedError } from './webhook.errors';

export interface WebhookClientOptions {
  fetchFn?: typeof fetch;
}

/**
 * Discord/Slack bildirim kanallarının paylaştığı basit webhook POST'u
 * (ARCHITECTURE §11). URL asla loglanmaz (secret sayılır).
 */
@Injectable()
export class WebhookClient {
  private readonly fetchFn: typeof fetch;

  constructor(options: WebhookClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async post(url: string, body: unknown): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new WebhookRequestFailedError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!response.ok) {
      throw new WebhookRequestFailedError(
        `HTTP ${response.status}: ${await safeText(response)}`,
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
