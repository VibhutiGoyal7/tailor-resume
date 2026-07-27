import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../api/errors.js';
import { copyForCode, errorToCopy } from './errorCopy.js';

describe('copyForCode', () => {
  it('returns distinct copy per known code', () => {
    expect(copyForCode('INVALID_CREDENTIALS').title).toBe("Couldn't sign you in");
    expect(copyForCode('RATE_LIMITED').title).toBe('Too many attempts');
    expect(copyForCode('NOT_FOUND').title).toBe('Not found');
  });
});

describe('errorToCopy', () => {
  it('uses the code title + the backend message for an ApiRequestError', () => {
    const copy = errorToCopy(
      new ApiRequestError('CONFLICT', 'Job is not awaiting confirmation.', 409),
    );
    expect(copy.title).toBe("That didn't work");
    expect(copy.message).toBe('Job is not awaiting confirmation.');
  });

  it('falls back to the code default when the message is empty', () => {
    const copy = errorToCopy(new ApiRequestError('INVALID_CREDENTIALS', '', 401));
    expect(copy.message).toBe('That email or password is incorrect.');
  });

  it('maps non-API errors to the generic INTERNAL copy', () => {
    expect(errorToCopy(new Error('boom')).title).toBe('Something went wrong');
    expect(errorToCopy('a string').title).toBe('Something went wrong');
  });
});
