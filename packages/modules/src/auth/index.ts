// auth module facade (ADR-008, ADR-010). Owns User, RefreshToken, and
// VerificationToken. Other modules only ever deal in `userId` strings, so the
// no-cross-module-Prisma rule (CLAUDE.md Section 1) stays intact.
//
// Implemented: email/password signup (with verification email), login, refresh
// (rotation + reuse detection), logout, access-token verification, email
// verification, forgot/reset password, and account read/change-password/delete.
// Still to come (slice 2b): Google sign-in.
import { prisma, type User } from '@tailor/db';
import {
  AppError,
  VERIFICATION_TOKEN_TYPES,
  type AccountView,
  type AuthUser,
  type LoginInput,
  type SignupInput,
  type VerificationTokenType,
} from '@tailor/shared-types';
import { logger } from '../logger.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  classifyRefresh,
  classifyVerificationToken,
  generateOpaqueToken,
  generateRefreshToken,
  hashRefreshToken,
  sha256Hex,
  signAccessToken,
  verifyAccessToken as verifyAccessTokenJwt,
  REFRESH_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './tokens.js';
import {
  createDefaultEmailSender,
  passwordResetUrl,
  verificationUrl,
  type EmailSender,
} from './email.js';

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

// Email sender is swappable (default from env: Resend if configured, else dev
// logger). Tests inject a capturing fake via setEmailSender().
let emailSender: EmailSender | undefined;
function getEmailSender(): EmailSender {
  return (emailSender ??= createDefaultEmailSender());
}
export function setEmailSender(sender: EmailSender): void {
  emailSender = sender;
}

/** Create a single-use token row and return the RAW token (for the emailed link). */
async function issueVerificationToken(
  userId: string,
  type: VerificationTokenType,
): Promise<string> {
  const raw = generateOpaqueToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
  });
  return raw;
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
    // Issue + send an email-verification link. Sending is best-effort: a mail
    // failure must not fail signup (the user can request a resend later).
    try {
      const rawToken = await issueVerificationToken(user.id, VERIFICATION_TOKEN_TYPES.emailVerify);
      await getEmailSender().sendVerificationEmail(user.email, verificationUrl(rawToken));
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'failed to send verification email on signup');
    }
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

  /** Consume an email-verification token and mark the user verified. */
  async verifyEmail(rawToken: string): Promise<AuthUser> {
    const row = await prisma.verificationToken.findFirst({
      where: { tokenHash: sha256Hex(rawToken), type: VERIFICATION_TOKEN_TYPES.emailVerify },
    });
    assertTokenValid(row, 'This verification link is invalid or has expired.');
    const user = await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return tx.user.update({ where: { id: row.userId }, data: { emailVerified: true } });
    });
    return toAuthUser(user);
  },

  /**
   * Start a password reset. Always resolves the same way whether or not the
   * email exists (no account enumeration); only sends mail if the user exists.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;
    try {
      const rawToken = await issueVerificationToken(
        user.id,
        VERIFICATION_TOKEN_TYPES.passwordReset,
      );
      await getEmailSender().sendPasswordResetEmail(user.email, passwordResetUrl(rawToken));
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'failed to send password-reset email');
    }
  },

  /** Consume a reset token, set the new password, and revoke all sessions. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const row = await prisma.verificationToken.findFirst({
      where: { tokenHash: sha256Hex(rawToken), type: VERIFICATION_TOKEN_TYPES.passwordReset },
    });
    assertTokenValid(row, 'This password-reset link is invalid or has expired.');
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      // Any existing sessions are now suspect — force re-login everywhere.
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revoked: false },
        data: { revoked: true },
      });
    });
  },

  /** Account summary for the authenticated user (GET /api/account). */
  async getAccount(userId: string): Promise<AccountView> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('NOT_FOUND', 'Account not found.');
    return {
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  },

  /** Change password for an authenticated user; revokes all other sessions. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('NOT_FOUND', 'Account not found.');
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    });
  },

  /**
   * Delete the account and everything it owns (build brief Section 5). Manual
   * cascade in one transaction, since the schema keeps cross-module rows as
   * loose userId references (no DB-level FKs to User).
   */
  async deleteAccount(userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const items = await tx.experienceItem.findMany({ where: { userId }, select: { id: true } });
      const itemIds = items.map((i) => i.id);
      if (itemIds.length > 0) {
        await tx.experienceBullet.deleteMany({ where: { experienceItemId: { in: itemIds } } });
      }
      await tx.experienceItem.deleteMany({ where: { userId } });
      await tx.resumeBasics.deleteMany({ where: { userId } });
      await tx.tailoredResume.deleteMany({ where: { userId } });
      await tx.tailoringJob.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  },
};

/** Narrow a verification-token row to a valid one or throw a 400 AppError. */
function assertTokenValid(
  row: { id: string; userId: string; usedAt: Date | null; expiresAt: Date } | null,
  message: string,
): asserts row is { id: string; userId: string; usedAt: Date | null; expiresAt: Date } {
  if (classifyVerificationToken(row, new Date()) !== 'valid') {
    throw new AppError('VALIDATION_FAILED', message);
  }
}

export { authRateLimiter, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS, RateLimiter } from './rate-limit.js';
export { DevEmailSender, ResendEmailSender } from './email.js';
export type { EmailSender } from './email.js';
