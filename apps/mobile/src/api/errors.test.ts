import { describe, expect, it } from 'vitest';
import { ApiRequestError, isApiRequestError, toApiRequestError } from './errors.js';

describe('toApiRequestError', () => {
  it('maps a canonical error body to a typed ApiRequestError', () => {
    const err = toApiRequestError(400, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Bad email.',
        fields: [{ field: 'email', issue: 'invalid' }],
      },
    });
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Bad email.');
    expect(err.status).toBe(400);
    expect(err.fields).toEqual([{ field: 'email', issue: 'invalid' }]);
  });

  it('falls back to INTERNAL for an unknown code or non-canonical body', () => {
    expect(toApiRequestError(500, { error: { code: 'WEIRD', message: 'x' } }).code).toBe(
      'INTERNAL',
    );
    expect(toApiRequestError(502, '<html>bad gateway</html>').code).toBe('INTERNAL');
    expect(toApiRequestError(500, null).message).toBe('Something went wrong.');
  });

  it('isApiRequestError narrows correctly', () => {
    expect(
      isApiRequestError(toApiRequestError(404, { error: { code: 'NOT_FOUND', message: 'no' } })),
    ).toBe(true);
    expect(isApiRequestError(new Error('nope'))).toBe(false);
  });
});
