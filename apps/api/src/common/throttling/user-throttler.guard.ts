import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth-user';

/**
 * Kullanıcı başına limit: sayaç IP yerine `JwtAuthGuard`'ın koyduğu
 * kullanıcı id'siyle tutulur (aynı ofisten gelen kullanıcılar birbirini
 * kısıtlamaz). Kullanıcısız istekte IP'ye düşer. Limit endpoint'te
 * `@Throttle` ile verilir; sayaçlar `AuthModule`'deki global
 * `ThrottlerModule`'ün Redis storage'ındadır.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as AuthUser | undefined;
    if (user?.id) {
      return Promise.resolve(`user:${user.id}`);
    }
    return super.getTracker(req);
  }
}
