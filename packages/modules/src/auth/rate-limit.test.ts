import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows up to maxAttempts then blocks', () => {
    const clock = 1_000_000;
    const rl = new RateLimiter(7, 60_000, () => clock);

    for (let i = 0; i < 7; i++) {
      expect(rl.hit('ip:email').allowed).toBe(true);
    }
    const blocked = rl.hit('ip:email');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts remaining down correctly', () => {
    const rl = new RateLimiter(3, 60_000, () => 0);
    expect(rl.hit('k').remaining).toBe(2);
    expect(rl.hit('k').remaining).toBe(1);
    expect(rl.hit('k').remaining).toBe(0);
    expect(rl.hit('k').allowed).toBe(false);
  });

  it('resets after the window elapses', () => {
    let clock = 0;
    const rl = new RateLimiter(2, 60_000, () => clock);
    rl.hit('k');
    rl.hit('k');
    expect(rl.hit('k').allowed).toBe(false);

    clock += 60_000; // window elapsed
    expect(rl.hit('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter(1, 60_000, () => 0);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(false);
    expect(rl.hit('b').allowed).toBe(true);
  });

  it('reset() clears a key immediately (e.g. after successful login)', () => {
    const rl = new RateLimiter(1, 60_000, () => 0);
    rl.hit('k');
    expect(rl.hit('k').allowed).toBe(false);
    rl.reset('k');
    expect(rl.hit('k').allowed).toBe(true);
  });
});
