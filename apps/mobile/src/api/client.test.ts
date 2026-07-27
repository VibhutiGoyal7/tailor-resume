import { describe, expect, it } from 'vitest';
import { buildHeaders, joinUrl } from './client.js';

describe('joinUrl', () => {
  it('joins base + path with exactly one slash', () => {
    expect(joinUrl('http://localhost:3000/api', '/auth/login')).toBe(
      'http://localhost:3000/api/auth/login',
    );
    expect(joinUrl('http://localhost:3000/api/', 'auth/login')).toBe(
      'http://localhost:3000/api/auth/login',
    );
    expect(joinUrl('http://x/api/', '/resumes')).toBe('http://x/api/resumes');
  });
});

describe('buildHeaders', () => {
  it('adds content-type only when there is a body', () => {
    expect(buildHeaders({ hasBody: true })).toEqual({ 'content-type': 'application/json' });
    expect(buildHeaders({ hasBody: false })).toEqual({});
  });

  it('adds a bearer header only when a token is present', () => {
    expect(buildHeaders({ hasBody: false, token: 'abc' })).toEqual({ authorization: 'Bearer abc' });
    expect(buildHeaders({ hasBody: true, token: 'abc' })).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer abc',
    });
    expect(buildHeaders({ hasBody: false, token: null })).toEqual({});
  });
});
