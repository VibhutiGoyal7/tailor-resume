// The ONE HTTP entry point for the app. Every API call goes through `apiRequest`,
// which: injects the bearer token, parses the canonical error shape into an
// ApiRequestError (errors.ts), and transparently refreshes the access token on a
// 401 (ADR-010 rotation) — retrying the original request once. On refresh failure
// it triggers logout via the registered auth bridge.
//
// The client is decoupled from React: AuthContext registers an "auth bridge"
// (read tokens / persist rotated tokens / handle auth-lost) at startup, so this
// module stays framework-agnostic and its pure helpers are unit-testable.
import { API_BASE_URL } from '../lib/config';
import { logger } from '../lib/logger';
import { toApiRequestError, ApiRequestError } from './errors';
import type { StoredTokens } from './tokenStore';

export interface AuthBridge {
  getTokens(): StoredTokens | null;
  /** Persist + apply rotated tokens after a successful refresh. */
  onRefreshed(tokens: StoredTokens): void;
  /** Refresh failed (or no refresh token) — session is over. */
  onAuthLost(): void;
}

let authBridge: AuthBridge | null = null;
export function registerAuthBridge(bridge: AuthBridge): void {
  authBridge = bridge;
}

/** Join the base URL and a path without doubling or dropping the slash. Pure. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Build request headers: JSON content-type when there's a body, bearer when authed. Pure. */
export function buildHeaders(opts: {
  token?: string | null;
  hasBody: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (opts.hasBody) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return headers;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach the bearer token (default true). Set false for login/signup/refresh. */
  auth?: boolean;
}

// Single-flight refresh: concurrent 401s share one refresh call instead of
// stampeding the refresh endpoint (and racing to rotate the same token).
let refreshInFlight: Promise<StoredTokens | null> | null = null;

async function refreshTokens(): Promise<StoredTokens | null> {
  const current = authBridge?.getTokens();
  if (!current) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(joinUrl(API_BASE_URL, '/auth/refresh'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!res.ok) return null;
        const next = (await res.json()) as StoredTokens;
        authBridge?.onRefreshed(next);
        logger.info('access token refreshed');
        return next;
      } catch (err) {
        logger.error('token refresh failed', { error: String(err) });
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Perform an API request and return the parsed JSON as `T`. Throws
 * ApiRequestError on any non-2xx (after a transparent refresh+retry on 401).
 * A `T` of `void` is fine for 204 responses.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const hasBody = body !== undefined;

  const doFetch = (token: string | null): Promise<Response> =>
    fetch(joinUrl(API_BASE_URL, path), {
      method,
      headers: buildHeaders({ token: auth ? token : null, hasBody }),
      body: hasBody ? JSON.stringify(body) : undefined,
    });

  const token = auth ? (authBridge?.getTokens()?.accessToken ?? null) : null;
  let res: Response;
  try {
    res = await doFetch(token);
  } catch (err) {
    // Network-level failure (no response) — surface as a consistent error.
    logger.error('network request failed', { path, method, error: String(err) });
    throw new ApiRequestError('INTERNAL', 'Network error — check your connection.', 0);
  }

  // Transparent refresh + single retry on 401 for authed requests.
  if (res.status === 401 && auth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await doFetch(refreshed.accessToken);
    } else {
      authBridge?.onAuthLost();
    }
  }

  if (!res.ok) {
    const errorBody = await parseBody(res);
    const apiError = toApiRequestError(res.status, errorBody);
    logger.warn('api call failed', { path, method, status: res.status, code: apiError.code });
    throw apiError;
  }

  logger.info('api call ok', { path, method, status: res.status });
  if (res.status === 204) return undefined as T;
  return (await parseBody(res)) as T;
}
