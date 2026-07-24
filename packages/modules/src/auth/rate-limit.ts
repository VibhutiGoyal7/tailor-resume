// Simple in-memory fixed-window rate limiter for /login and /signup
// (build brief Section 6: 7 attempts, then temporary lockout). Keyed by
// IP+email. In-memory is fine for a single web instance in Phase 1; the same
// interface can later be backed by Redis without touching callers.
//
// The clock is injectable so lockout/window behavior is unit-testable without
// real time.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (only meaningful when !allowed). */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Record one attempt for `key` and report whether it is allowed. */
  hit(key: string): RateLimitResult {
    const t = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || t - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: t });
      return { allowed: true, remaining: this.maxAttempts - 1, retryAfterSeconds: 0 };
    }

    if (bucket.count >= this.maxAttempts) {
      const retryAfterSeconds = Math.ceil((bucket.windowStart + this.windowMs - t) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: this.maxAttempts - bucket.count,
      retryAfterSeconds: 0,
    };
  }

  /** Clear a key's counter, e.g. after a successful login. */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}

// Shared limiter for auth endpoints: 7 attempts per 15-minute window.
export const AUTH_MAX_ATTEMPTS = 7;
export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const authRateLimiter = new RateLimiter(AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS);
