// Pure auth state machine — extracted from the provider so the transitions are
// unit-tested without React (same approach as the logger's pure helpers).
import type { StoredTokens } from '../api/tokenStore';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  tokens: StoredTokens | null;
}

export type AuthAction =
  // App start: tokens loaded from secure store (or null if none / logged out).
  | { type: 'bootstrapped'; tokens: StoredTokens | null }
  // A fresh login or a token refresh produced tokens.
  | { type: 'authenticated'; tokens: StoredTokens }
  // Logout, or refresh failed — session is over.
  | { type: 'unauthenticated' };

export const initialAuthState: AuthState = { status: 'loading', tokens: null };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'bootstrapped':
      return {
        status: action.tokens ? 'authenticated' : 'unauthenticated',
        tokens: action.tokens,
      };
    case 'authenticated':
      return { status: 'authenticated', tokens: action.tokens };
    case 'unauthenticated':
      return { status: 'unauthenticated', tokens: null };
    default:
      return state;
  }
}
