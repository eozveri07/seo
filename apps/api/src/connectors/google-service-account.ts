import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/environment-variables';
import { ConnectorAuthError } from './errors';

export interface GoogleServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

/**
 * ARCHITECTURE §9.1/§9.2: tek bir sistem service account'u, JSON'u base64
 * olarak `GOOGLE_SA_JSON_BASE64`'te tutulur. Env tanımsızsa uygulama yine de
 * açılır (env validasyonunda `@IsOptional`); yalnız bir connector metodu
 * çağrıldığında anlaşılır bir `ConnectorAuthError` fırlatılır.
 */
export function loadGoogleServiceAccount(
  configService: ConfigService<EnvironmentVariables, true>,
): GoogleServiceAccountCredentials {
  const base64 = configService.get('GOOGLE_SA_JSON_BASE64', { infer: true });
  if (!base64) {
    throw new ConnectorAuthError(
      "GOOGLE_SA_JSON_BASE64 tanımlı değil; sistem service account'u yapılandırılmamış.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    throw new ConnectorAuthError(
      'GOOGLE_SA_JSON_BASE64 geçerli bir JSON içermiyor.',
    );
  }

  const clientEmail = (parsed as { client_email?: unknown }).client_email;
  const privateKey = (parsed as { private_key?: unknown }).private_key;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new ConnectorAuthError(
      'GOOGLE_SA_JSON_BASE64 içeriğinde client_email/private_key eksik.',
    );
  }

  return { clientEmail, privateKey };
}
