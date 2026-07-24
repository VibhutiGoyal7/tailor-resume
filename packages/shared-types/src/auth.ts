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
