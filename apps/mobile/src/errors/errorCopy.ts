// The ONE mapping from a backend error `code` to user-facing copy (CLAUDE.md §4).
// No screen writes its own error strings — every error surfaced to the user routes
// through here and is shown via <ErrorDialog>. When the backend adds an error code,
// add its copy here (one place), not in a screen.
import { ERROR_CODES, type ErrorCode } from '@tailor/shared-types';
import { isApiRequestError } from '../api/errors';

export interface ErrorCopy {
  title: string;
  message: string;
}

/**
 * Default copy per code. The backend `message` is often specific and helpful, so
 * screens may prefer it; this provides a friendly, stable fallback title + message
 * per code for when the raw message isn't suitable to show.
 */
const COPY: Record<ErrorCode, ErrorCopy> = {
  [ERROR_CODES.VALIDATION_FAILED]: {
    title: 'Check your details',
    message: 'Some information looks incorrect. Please review and try again.',
  },
  [ERROR_CODES.INVALID_CREDENTIALS]: {
    title: "Couldn't sign you in",
    message: 'That email or password is incorrect.',
  },
  [ERROR_CODES.UNAUTHENTICATED]: {
    title: 'Session expired',
    message: 'Please sign in again to continue.',
  },
  [ERROR_CODES.UNAUTHORIZED]: {
    title: 'Not allowed',
    message: "You don't have access to do that.",
  },
  [ERROR_CODES.NOT_FOUND]: {
    title: 'Not found',
    message: "We couldn't find what you were looking for.",
  },
  [ERROR_CODES.CONFLICT]: {
    title: "That didn't work",
    message: 'This action conflicts with the current state. Please refresh and try again.',
  },
  [ERROR_CODES.RATE_LIMITED]: {
    title: 'Too many attempts',
    message: 'You’ve tried that too many times. Please wait a moment and try again.',
  },
  [ERROR_CODES.INTERNAL]: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
  },
};

/** Look up default copy for a known code (falls back to INTERNAL). */
export function copyForCode(code: ErrorCode): ErrorCopy {
  return COPY[code] ?? COPY[ERROR_CODES.INTERNAL];
}

/**
 * Resolve any thrown value into displayable copy. For an ApiRequestError, prefer
 * the backend's specific message (it's written for humans) under the code's title;
 * anything else falls back to the generic INTERNAL copy. Screens call this, then
 * pass the result to <ErrorDialog>.
 */
export function errorToCopy(err: unknown): ErrorCopy {
  if (isApiRequestError(err)) {
    const base = copyForCode(err.code);
    return { title: base.title, message: err.message || base.message };
  }
  return COPY[ERROR_CODES.INTERNAL];
}
