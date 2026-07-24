// auth module facade (ADR-008, ADR-010). Owns User + RefreshToken. Other
// modules only ever deal in `userId` strings, so the no-cross-module-Prisma
// rule (CLAUDE.md Section 1) stays intact.
//
// This slice: email/password signup, login, refresh (with rotation + reuse
// detection), logout, and access-token verification. Email verification,
// password reset, and Google sign-in are the next slice.
import { prisma, type User } from '@tailor/db';
import { AppError, type AuthUser, type LoginInput, type SignupInput } from '@tailor/shared-types';
import { hashPassword, verifyPassword } from './password.js';
import {
  classifyRefresh,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken as verifyAccessTokenJwt,
  REFRESH_TOKEN_TTL_MS,
} from './tokens.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set — cannot issue or verify access tokens.');
  return secret;
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, emailVerified: user.emailVerified };
}

/** Mint an access token + a fresh persisted refresh token for a user. */
async function issueTokens(userId: string): Promise<TokenPair> {
  const accessToken = await signAccessToken(userId, jwtSecret());
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

export const authModule = {
  /** Create a new user. Does NOT log them in (contract: signup -> 201). */
  async signup(input: SignupInput): Promise<AuthUser> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError('CONFLICT', 'That email is already registered.');
    }
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash: await hashPassword(input.password) },
    });
    return toAuthUser(user);
  },

  /** Verify credentials and issue a token pair. */
  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Same error whether the user is missing or the password is wrong — never
    // reveal which, to avoid account enumeration.
    const invalid = new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (!user) throw invalid;
    if (!(await verifyPassword(user.passwordHash, input.password))) throw invalid;

    return { user: toAuthUser(user), tokens: await issueTokens(user.id) };
  },

  /**
   * Rotate a refresh token (ADR-010): the presented token is revoked and a new
   * pair issued. Presenting an already-revoked token is treated as theft and
   * revokes every refresh token for that user.
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const row = await prisma.refreshToken.findFirst({ where: { tokenHash } });
    const outcome = classifyRefresh(row, new Date());

    switch (outcome) {
      case 'invalid':
        throw new AppError('UNAUTHENTICATED', 'Invalid refresh token.');
      case 'expired':
        throw new AppError('UNAUTHENTICATED', 'Refresh token has expired; please log in again.');
      case 'reuse':
        // row is non-null here (classifyRefresh only returns 'reuse' for a row).
        await prisma.refreshToken.updateMany({
          where: { userId: row!.userId, revoked: false },
          data: { revoked: true },
        });
        throw new AppError(
          'UNAUTHENTICATED',
          'This session was revoked for security. Please log in again.',
        );
      case 'valid': {
        // Rotate atomically: revoke the old row, then issue a new pair.
        return prisma.$transaction(async (tx) => {
          await tx.refreshToken.update({ where: { id: row!.id }, data: { revoked: true } });
          const accessToken = await signAccessToken(row!.userId, jwtSecret());
          const refreshToken = generateRefreshToken();
          await tx.refreshToken.create({
            data: {
              userId: row!.userId,
              tokenHash: hashRefreshToken(refreshToken),
              expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
            },
          });
          return { accessToken, refreshToken };
        });
      }
    }
  },

  /** Revoke a refresh token. Idempotent — unknown/already-revoked is a no-op. */
  async logout(rawRefreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawRefreshToken), revoked: false },
      data: { revoked: true },
    });
  },

  /** Verify an access token and return its claims (used by requireAuth). */
  verifyAccessToken(token: string): Promise<{ userId: string }> {
    return verifyAccessTokenJwt(token, jwtSecret());
  },
};

export { authRateLimiter, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS, RateLimiter } from './rate-limit.js';
