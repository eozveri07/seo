import {
  ConnectorAuthError,
  ConnectorError,
  ConnectorPermanentError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../errors';

/** grpc durum kodları (`google-gax`), `@google-analytics/data` bunları kullanır. */
const GRPC_STATUS = {
  DeadlineExceeded: 4,
  PermissionDenied: 7,
  ResourceExhausted: 8,
  Unavailable: 14,
  Unauthenticated: 16,
} as const;

interface GrpcLikeError {
  code?: unknown;
  message?: unknown;
}

/** `@google-analytics/data` (grpc) hatalarını durum koduna göre sınıflandırır. */
export function classifyGa4Error(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }
  const grpcError = error as GrpcLikeError;
  const code = typeof grpcError.code === 'number' ? grpcError.code : undefined;
  const message =
    (typeof grpcError.message === 'string' ? grpcError.message : undefined) ??
    'GA4 API isteği başarısız oldu.';

  if (
    code === GRPC_STATUS.Unauthenticated ||
    code === GRPC_STATUS.PermissionDenied
  ) {
    return new ConnectorAuthError(message, error);
  }
  if (code === GRPC_STATUS.ResourceExhausted) {
    return new ConnectorQuotaError(message, error);
  }
  if (
    code === undefined ||
    code === GRPC_STATUS.Unavailable ||
    code === GRPC_STATUS.DeadlineExceeded
  ) {
    return new ConnectorTransientError(message, error);
  }
  return new ConnectorPermanentError(message, error);
}
