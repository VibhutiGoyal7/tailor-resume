// Token persistence. Access + refresh tokens live in the platform secure store
// (iOS Keychain / Android Keystore via expo-secure-store), NEVER in AsyncStorage
// (ADR-010, build brief §7 mobile storage). Thin I/O wrapper — the only place the
// app talks to SecureStore — so the rest of the app depends on this interface.
import * as SecureStore from 'expo-secure-store';
import { logger } from '../lib/logger';

const ACCESS_KEY = 'tailor.accessToken';
const REFRESH_KEY = 'tailor.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

/** Load both tokens, or null if either is absent (treated as logged-out). */
export async function loadTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
  logger.info('cleared stored tokens');
}

// First-run choice (ADR-016) is shown once per device after the first login.
const FIRST_RUN_KEY = 'tailor.firstRunComplete';

export async function isFirstRunComplete(): Promise<boolean> {
  return (await SecureStore.getItemAsync(FIRST_RUN_KEY)) === '1';
}

export async function setFirstRunComplete(): Promise<void> {
  await SecureStore.setItemAsync(FIRST_RUN_KEY, '1');
}
