// Route-level guard over the auth module's shared rate limiter
// (7 attempts / 15 min, build brief Section 6).
import { authRateLimiter } from '@tailor/modules';
import { AppError } from '@tailor/shared-types';

export function enforceRateLimit(key: string): void {
  const result = authRateLimiter.hit(key);
  if (!result.allowed) {
    throw new AppError(
      'RATE_LIMITED',
      `Too many attempts. Please try again in about ${result.retryAfterSeconds} seconds.`,
    );
  }
}

export function resetRateLimit(key: string): void {
  authRateLimiter.reset(key);
}
