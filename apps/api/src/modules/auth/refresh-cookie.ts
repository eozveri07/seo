import type { CookieOptions } from 'express';
import { Environment } from '../../config/environment-variables';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * ARCHITECTURE §4.4: httpOnly, Secure, SameSite=Lax, path `/api/v1/auth`.
 * Development'ta panel Vite proxy üzerinden http ile çalıştığı için Secure kapalı.
 */
export function refreshCookieOptions(
  nodeEnv: Environment,
  apiPrefix: string,
): CookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv !== Environment.Development,
    sameSite: 'lax',
    path: `${apiPrefix.replace(/\/+$/, '')}/auth`,
  };
}
