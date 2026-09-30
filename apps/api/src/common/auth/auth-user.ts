/** JwtAuthGuard'ın access token'dan çıkarıp request'e koyduğu kullanıcı. */
export interface AuthUser {
  id: string;
}

export interface AccessTokenPayload {
  sub: string;
}
