import { describe, expect, it } from 'vitest';
import {
  classifyRefresh,
  classifyVerificationToken,
  generateOpaqueToken,
  generateRefreshToken,
  hashRefreshToken,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

const SECRET = 'test-secret-do-not-use-in-prod';

describe('access token', () => {
  it('round-trips userId through sign + verify', async () => {
    const token = await signAccessToken('user_123', SECRET);
    await expect(verifyAccessToken(token, SECRET)).resolves.toEqual({ userId: 'user_123' });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAccessToken('user_123', SECRET);
    await expect(verifyAccessToken(token, 'other-secret')).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signAccessToken('user_123', SECRET, -1); // already expired
    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects a garbage token', async () => {
    await expect(verifyAccessToken('not.a.jwt', SECRET)).rejects.toThrow();
  });
});

describe('refresh token', () => {
  it('generates unique, high-entropy tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).toHaveLength(64); // 32 bytes hex
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and never equals the raw token', () => {
    const raw = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    expect(hashRefreshToken(raw)).not.toBe(raw);
  });
});

describe('opaque verification tokens', () => {
  it('generates unique 64-char tokens and hashes them deterministically', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(a));
    expect(sha256Hex(a)).not.toBe(a);
  });
});

describe('classifyVerificationToken', () => {
  const now = new Date('2026-07-24T12:00:00Z');
  const future = new Date('2026-07-24T12:30:00Z');
  const past = new Date('2026-07-24T11:30:00Z');

  it('unknown token -> invalid', () => {
    expect(classifyVerificationToken(null, now)).toBe('invalid');
  });
  it('already-used token -> used', () => {
    expect(classifyVerificationToken({ usedAt: past, expiresAt: future }, now)).toBe('used');
  });
  it('expired token -> expired', () => {
    expect(classifyVerificationToken({ usedAt: null, expiresAt: past }, now)).toBe('expired');
  });
  it('fresh unused token -> valid', () => {
    expect(classifyVerificationToken({ usedAt: null, expiresAt: future }, now)).toBe('valid');
  });
  it('used takes precedence over expiry', () => {
    expect(classifyVerificationToken({ usedAt: past, expiresAt: past }, now)).toBe('used');
  });
});

describe('classifyRefresh', () => {
  const now = new Date('2026-07-24T12:00:00Z');
  const future = new Date('2026-08-24T12:00:00Z');
  const past = new Date('2026-07-23T12:00:00Z');

  it('unknown token -> invalid', () => {
    expect(classifyRefresh(null, now)).toBe('invalid');
  });

  it('already-revoked token -> reuse (theft signal)', () => {
    expect(classifyRefresh({ revoked: true, expiresAt: future }, now)).toBe('reuse');
  });

  it('past-expiry token -> expired', () => {
    expect(classifyRefresh({ revoked: false, expiresAt: past }, now)).toBe('expired');
  });

  it('valid unrevoked unexpired token -> valid', () => {
    expect(classifyRefresh({ revoked: false, expiresAt: future }, now)).toBe('valid');
  });

  it('reuse takes precedence over expiry', () => {
    expect(classifyRefresh({ revoked: true, expiresAt: past }, now)).toBe('reuse');
  });
});
