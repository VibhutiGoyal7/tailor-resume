import { describe, expect, it } from 'vitest';
import { authReducer, initialAuthState } from './authReducer.js';

const tokens = { accessToken: 'a', refreshToken: 'r' };

describe('authReducer', () => {
  it('starts in loading', () => {
    expect(initialAuthState).toEqual({ status: 'loading', tokens: null });
  });

  it('bootstrapped with tokens -> authenticated; without -> unauthenticated', () => {
    expect(authReducer(initialAuthState, { type: 'bootstrapped', tokens })).toEqual({
      status: 'authenticated',
      tokens,
    });
    expect(authReducer(initialAuthState, { type: 'bootstrapped', tokens: null })).toEqual({
      status: 'unauthenticated',
      tokens: null,
    });
  });

  it('authenticated stores the tokens; unauthenticated clears them', () => {
    const authed = authReducer(initialAuthState, { type: 'authenticated', tokens });
    expect(authed).toEqual({ status: 'authenticated', tokens });
    expect(authReducer(authed, { type: 'unauthenticated' })).toEqual({
      status: 'unauthenticated',
      tokens: null,
    });
  });
});
