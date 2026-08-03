// Auth provider: owns the session (tokens + status), persists tokens to the secure
// store, and registers the API client's "auth bridge" so the client can read the
// current token, apply rotated tokens after a refresh, and force logout when a
// refresh fails. Screens consume `useAuth()` for status + signIn/signUp/signOut.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerAuthBridge } from '../api/client';
import * as authApi from '../api/auth';
import {
  clearTokens,
  isFirstRunComplete,
  loadTokens,
  saveTokens,
  setFirstRunComplete,
  type StoredTokens,
} from '../api/tokenStore';
import { logger } from '../lib/logger';
import { authReducer, initialAuthState, type AuthStatus } from './authReducer';

export type FirstRunChoice = 'upload' | 'scratch';

interface AuthContextValue {
  status: AuthStatus;
  /** False until the one-time first-run choice has been made (ADR-016). */
  firstRunComplete: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeFirstRun: (choice: FirstRunChoice) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [firstRunComplete, setFirstRun] = useState(false);
  // The client's auth bridge needs the *current* tokens synchronously; a ref
  // mirrors state so the registered callbacks always read the latest value.
  const tokensRef = useRef<StoredTokens | null>(null);
  tokensRef.current = state.tokens;

  // Register the bridge once so the client is decoupled from React.
  useEffect(() => {
    registerAuthBridge({
      getTokens: () => tokensRef.current,
      onRefreshed: (tokens) => {
        tokensRef.current = tokens;
        void saveTokens(tokens);
        dispatch({ type: 'authenticated', tokens });
      },
      onAuthLost: () => {
        tokensRef.current = null;
        void clearTokens();
        dispatch({ type: 'unauthenticated' });
        logger.warn('session ended (refresh failed)');
      },
    });
  }, []);

  // Bootstrap the session + first-run flag from the secure store on launch.
  useEffect(() => {
    void (async () => {
      const [tokens, firstRun] = await Promise.all([loadTokens(), isFirstRunComplete()]);
      setFirstRun(firstRun);
      dispatch({ type: 'bootstrapped', tokens });
      logger.info('auth bootstrapped', { authenticated: tokens !== null });
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      firstRunComplete,
      completeFirstRun: (choice) => {
        void setFirstRunComplete();
        setFirstRun(true);
        logger.info('first-run choice made', { choice });
      },
      signIn: async (email, password) => {
        const tokens = await authApi.login(email, password);
        await saveTokens(tokens);
        dispatch({ type: 'authenticated', tokens });
        logger.info('signed in');
      },
      signUp: async (email, password) => {
        // Signup creates the account (201) but doesn't log in — email must be
        // verified first (build brief §5). The UI then routes to "check your email".
        await authApi.signup(email, password);
        logger.info('signed up');
      },
      signOut: async () => {
        const refreshToken = tokensRef.current?.refreshToken;
        if (refreshToken) {
          // Best-effort server revoke; local logout proceeds regardless.
          await authApi
            .logout(refreshToken)
            .catch((err) =>
              logger.warn('server logout failed; clearing locally', { error: String(err) }),
            );
        }
        await clearTokens();
        dispatch({ type: 'unauthenticated' });
        logger.info('signed out');
      },
    }),
    [state.status, firstRunComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
