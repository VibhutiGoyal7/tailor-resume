import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  isApiErrorBody,
  makeError,
  validationError,
  type ApiErrorBody,
} from './errors.js';

describe('makeError', () => {
  it('wraps code + message in the canonical { error } shape', () => {
    expect(makeError(ERROR_CODES.NOT_FOUND, 'Resume not found.')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resume not found.' },
    });
  });

  it('omits fields when none are provided', () => {
    const body = makeError(ERROR_CODES.INTERNAL, 'Something went wrong.');
    expect('fields' in body.error).toBe(false);
  });

  it('omits fields when given an empty array', () => {
    const body = makeError(ERROR_CODES.VALIDATION_FAILED, 'bad', []);
    expect('fields' in body.error).toBe(false);
  });

  it('includes fields when non-empty', () => {
    const body = makeError(ERROR_CODES.VALIDATION_FAILED, 'bad', [
      { field: 'email', issue: 'required' },
    ]);
    expect(body.error.fields).toEqual([{ field: 'email', issue: 'required' }]);
  });
});

describe('validationError', () => {
  it('uses VALIDATION_FAILED and carries the field issues', () => {
    const body = validationError([{ field: 'password', issue: 'too_short' }]);
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(body.error.fields).toHaveLength(1);
  });
});

describe('isApiErrorBody', () => {
  it('accepts a well-formed error body', () => {
    const body: ApiErrorBody = makeError(ERROR_CODES.CONFLICT, 'Email already registered.');
    expect(isApiErrorBody(body)).toBe(true);
  });

  it.each([null, undefined, {}, { error: null }, { error: { code: 1 } }, 'nope'])(
    'rejects malformed value %o',
    (value) => {
      expect(isApiErrorBody(value)).toBe(false);
    },
  );
});
