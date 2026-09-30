import {
  ConnectorAuthError,
  ConnectorError,
  ConnectorPermanentError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../errors';

/** DataForSEO durum kodları: `20000` başarı, `>=50000` sunucu hatası (yeniden denenebilir). */
const SERVER_ERROR_STATUS_CODE = 50000;
const AUTH_ERROR_STATUS_CODES = new Set([40100, 40101, 40102]);

export function classifyDataForSeoHttpStatus(
  status: number,
  message: string,
): ConnectorError {
  if (status === 401 || status === 403) {
    return new ConnectorAuthError(message);
  }
  if (status === 429) {
    return new ConnectorQuotaError(message);
  }
  if (status >= 500) {
    return new ConnectorTransientError(message);
  }
  return new ConnectorPermanentError(message);
}

/** Top-level ya da task-level `status_code` (HTTP 200 ama içerik hatalı). */
export function classifyDataForSeoApiStatus(
  statusCode: number,
  statusMessage: string,
): ConnectorError {
  if (AUTH_ERROR_STATUS_CODES.has(statusCode)) {
    return new ConnectorAuthError(statusMessage);
  }
  if (statusCode >= SERVER_ERROR_STATUS_CODE) {
    return new ConnectorTransientError(statusMessage);
  }
  return new ConnectorPermanentError(statusMessage);
}
