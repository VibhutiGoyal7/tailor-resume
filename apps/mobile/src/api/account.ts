// Typed account API calls (build brief §5 — account & settings). Thin wrappers over
// apiRequest; the Profile tab consumes these through TanStack Query. `getAccount`
// backs the profile header (email); `deleteAccount` is the destructive settings
// action (cascades all user-owned rows, then the app clears the local session).
import { apiRequest } from './client';
import type { AccountView } from '@tailor/shared-types';

/** GET /account — the signed-in user's account details (email, verified, joined). */
export function getAccount(): Promise<AccountView> {
  return apiRequest<AccountView>('/account', { method: 'GET' });
}

/** DELETE /account — permanently delete the account and all its data (204). */
export function deleteAccount(): Promise<void> {
  return apiRequest<void>('/account', { method: 'DELETE' });
}
