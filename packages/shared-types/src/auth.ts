// Auth request/response contracts (build brief Section 5 & 6), shared by the
// web routes (validation), the auth module (input types), and tests.
import { z } from 'zod';

// Password policy: min 8 chars. Kept as a single source so signup, reset, and
// change-password stay consistent.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1), // don't reveal policy on login; just require non-empty
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;
export type LogoutInput = RefreshInput;

/** Safe public view of a user — never includes passwordHash. */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

// --- Slice 2: email verification, password reset, account management ---

/** Single-use verification token kinds (VerificationToken.type). */
export const VERIFICATION_TOKEN_TYPES = {
  emailVerify: 'email_verify',
  passwordReset: 'password_reset',
} as const;
export type VerificationTokenType =
  (typeof VERIFICATION_TOKEN_TYPES)[keyof typeof VERIFICATION_TOKEN_TYPES];

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Response for GET /api/account. */
export interface AccountView {
  email: string;
  emailVerified: boolean;
  createdAt: string; // ISO 8601
}
