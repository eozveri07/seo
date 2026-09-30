import type { authControllerLoginResponse } from '@/api/auth/auth'
import type { UserResponseDto } from '@/api/endpoints.schemas'

export type LoginOutcome =
  | { type: 'success'; accessToken: string; user: UserResponseDto }
  | { type: 'error'; message: string }

/** authControllerLogin yanıtını yorumlar; yalnızca 2xx yanıtta oturum açar. */
export function resolveLoginOutcome(response: authControllerLoginResponse | null): LoginOutcome {
  if (!response) {
    return { type: 'error', message: 'Sunucuya ulaşılamadı. Tekrar deneyin.' }
  }
  if (response.status === 401) {
    return { type: 'error', message: 'E-posta veya şifre hatalı.' }
  }
  if (response.status === 429) {
    return { type: 'error', message: 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.' }
  }
  if (response.status !== 200) {
    return { type: 'error', message: 'Giriş yapılamadı, tekrar deneyin.' }
  }
  return { type: 'success', accessToken: response.data.accessToken, user: response.data.user }
}
