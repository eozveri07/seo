import {
  ConnectorAuthError,
  ConnectorError,
  ConnectorPermanentError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../errors';

interface GaxiosLikeError {
  code?: unknown;
  status?: unknown;
  response?: { status?: unknown; data?: { error?: { message?: unknown } } };
  message?: unknown;
}

function extractStatus(error: GaxiosLikeError): number | undefined {
  const candidates = [error.response?.status, error.code, error.status];
  for (const candidate of candidates) {
    const status =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string' && /^\d+$/.test(candidate)
          ? Number(candidate)
          : undefined;
    if (status !== undefined) {
      return status;
    }
  }
  return undefined;
}

function extractMessage(error: GaxiosLikeError): string {
  const nested = error.response?.data?.error?.message;
  if (typeof nested === 'string') {
    return nested;
  }
  if (typeof error.message === 'string') {
    return error.message;
  }
  return 'GSC API isteği başarısız oldu.';
}

/** `googleapis` (`searchconsole`) hatalarını HTTP durum koduna göre sınıflandırır. */
export function classifyGscError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }
  const gaxiosError = error as GaxiosLikeError;
  const status = extractStatus(gaxiosError);
  const message = extractMessage(gaxiosError);

  if (status === 401 || status === 403) {
    return new ConnectorAuthError(message, error);
  }
  if (status === 429) {
    return new ConnectorQuotaError(message, error);
  }
  if (status === undefined || status >= 500) {
    return new ConnectorTransientError(message, error);
  }
  return new ConnectorPermanentError(message, error);
}
