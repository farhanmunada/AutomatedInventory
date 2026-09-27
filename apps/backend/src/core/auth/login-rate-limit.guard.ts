import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../errors/app-error';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/**
 * Sliding-window limiter for login attempts, keyed by client IP.
 *
 * ponytail: counts live in process memory, so a horizontally scaled deployment
 * counts per instance. Upgrade path = move `hits` to a shared store (pg table
 * with TTL, or Redis) only when the API runs more than one instance.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

    if (recent.length >= MAX_ATTEMPTS) {
      this.hits.set(key, recent);
      throw new AppError(
        429,
        `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(WINDOW_MS / 1000)} detik.`,
        'RATE_LIMITED',
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.evictExpired(now);
    return true;
  }

  private evictExpired(now: number): void {
    for (const [key, times] of this.hits) {
      const alive = times.filter((at) => now - at < WINDOW_MS);
      if (alive.length === 0) this.hits.delete(key);
      else this.hits.set(key, alive);
    }
  }
}
