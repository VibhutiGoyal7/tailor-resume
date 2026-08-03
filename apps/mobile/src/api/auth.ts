// Typed auth API calls (build brief §5 auth contracts). Thin wrappers over
// apiRequest — the AuthContext orchestrates state/persistence around these.
// login/signup/refresh are unauthenticated (`auth: false`); the rest either carry
// a one-time token in the body or the bearer.
import { apiRequest } from './client';
import type { StoredTokens } from './tokenStore';

export function signup(email: string, password: string): Promise<void> {
  return apiRequest<void>('/auth/signup', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function login(email: string, password: string): Promise<StoredTokens> {
  return apiRequest<StoredTokens>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
}

export function verifyEmail(token: string): Promise<void> {
  return apiRequest<void>('/auth/verify-email', { method: 'POST', body: { token }, auth: false });
}

export function forgotPassword(email: string): Promise<void> {
  return apiRequest<void>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
    auth: false,
  });
}
