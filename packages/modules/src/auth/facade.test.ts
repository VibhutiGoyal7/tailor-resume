// Integration tests for the auth facade against a real database.
// Gated on RUN_DB_TESTS=1 (explicit opt-in) so a plain `npm test` never mutates
// a developer's dev database — CI sets it with an ephemeral Postgres, and
// locally you run `RUN_DB_TESTS=1 npm test`. DATABASE_URL comes from the env
// (CI) or the root .env (which vitest loads).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@tailor/db';
import { AppError } from '@tailor/shared-types';
import { authModule } from './index.js';
import { hashRefreshToken } from './tokens.js';

const runDb = process.env.RUN_DB_TESTS === '1';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';

describe.skipIf(!runDb)('authModule (DB integration)', () => {
  // Unique email namespace for this file so it never clobbers other DB test
  // files running in parallel against the same database.
  const creds = { email: 'facade-test@example.com', password: 'sup3r-secret-pw' };

  async function cleanup(): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { email: creds.email } });
    if (existing) {
      await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
  }

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('signup creates an unverified user and never returns the hash', async () => {
    const user = await authModule.signup(creds);
    expect(user).toMatchObject({ email: creds.email, emailVerified: false });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('signup rejects a duplicate email with CONFLICT', async () => {
    await authModule.signup(creds);
    await expect(authModule.signup(creds)).rejects.toMatchObject({
      constructor: AppError,
      code: 'CONFLICT',
    });
  });

  it('login succeeds with correct password and issues a token pair', async () => {
    await authModule.signup(creds);
    const { user, tokens } = await authModule.login(creds);
    expect(user.email).toBe(creds.email);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toHaveLength(64);
    await expect(authModule.verifyAccessToken(tokens.accessToken)).resolves.toEqual({
      userId: user.id,
    });
  });

  it('login with wrong password throws INVALID_CREDENTIALS', async () => {
    await authModule.signup(creds);
    await expect(authModule.login({ email: creds.email, password: 'wrong' })).rejects.toMatchObject(
      { code: 'INVALID_CREDENTIALS' },
    );
  });

  it('login for a missing user throws INVALID_CREDENTIALS (no enumeration)', async () => {
    await expect(
      authModule.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('refresh rotates: old token is revoked, a new pair is returned', async () => {
    await authModule.signup(creds);
    const { tokens } = await authModule.login(creds);

    const rotated = await authModule.refresh(tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    const oldRow = await prisma.refreshToken.findFirst({
      where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
    });
    expect(oldRow?.revoked).toBe(true);
  });

  it('reusing a revoked refresh token revokes ALL of the user’s tokens', async () => {
    const created = await authModule.signup(creds);
    const { tokens } = await authModule.login(creds);
    const rotated = await authModule.refresh(tokens.refreshToken); // original now revoked

    // Present the original (revoked) token again -> theft signal.
    await expect(authModule.refresh(tokens.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    // The rotated token must now also be dead.
    await expect(authModule.refresh(rotated.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const active = await prisma.refreshToken.count({
      where: { userId: created.id, revoked: false },
    });
    expect(active).toBe(0);
  });

  it('logout revokes the refresh token (idempotently)', async () => {
    await authModule.signup(creds);
    const { tokens } = await authModule.login(creds);

    await authModule.logout(tokens.refreshToken);
    await expect(authModule.refresh(tokens.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    // Second logout is a no-op, not an error.
    await expect(authModule.logout(tokens.refreshToken)).resolves.toBeUndefined();
  });
});
