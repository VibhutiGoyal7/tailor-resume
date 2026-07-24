// Token primitives (build brief Section 6, ADR-010).
// - Access token: short-lived HS256 JWT, payload { userId } only.
// - Refresh token: opaque 32-byte random string, stored ONLY as a sha256 hash.
// Secret and clock are passed in (not read from env here) so this is fully
// unit-testable without environment or DB.
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min (ADR-010)
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenClaims {
  userId: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  userId: string,
  secret: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey(secret));
}

/** Verifies signature + expiry and returns the claims, or throws if invalid. */
export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ['HS256'] });
  if (typeof payload.userId !== 'string') {
    throw new Error('Access token missing userId claim');
  }
  return { userId: payload.userId };
}

/** A fresh opaque refresh token: the raw value (returned to client, never stored). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/** sha256 hex of a raw refresh token — this is what we persist (never the raw). */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export type RefreshOutcome = 'valid' | 'invalid' | 'reuse' | 'expired';

/**
 * Pure rotation/reuse decision (ADR-010). Given the stored row for a presented
 * refresh token (or null if no row matched) and the current time:
 * - null            -> 'invalid'  (unknown token)
 * - revoked already -> 'reuse'    (a revoked token being presented again is a
 *                                   theft/replay signal -> caller revokes ALL of
 *                                   that user's tokens)
 * - past expiry     -> 'expired'
 * - otherwise       -> 'valid'    (rotate: revoke this row, issue a new pair)
 */
export function classifyRefresh(
  row: { revoked: boolean; expiresAt: Date } | null,
  now: Date,
): RefreshOutcome {
  if (!row) return 'invalid';
  if (row.revoked) return 'reuse';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}
