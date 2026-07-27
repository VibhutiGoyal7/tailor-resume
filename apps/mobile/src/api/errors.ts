// Client-side representation of a backend error. The backend uses ONE error shape
// everywhere — `{ error: { code, message, fields? } }` (build brief §5) — and
// shares the `ApiError`/`ErrorCode` types via @tailor/shared-types, so the app
// reuses them rather than redefining. Every failed API call throws an ApiRequestError
// carrying the stable `code`; screens map that code to copy via errorCopy.ts and
// show it through the one ErrorDialog (CLAUDE.md §4).
import { ERROR_CODES, type ApiError, type ErrorCode, type FieldIssue } from '@tailor/shared-types';

export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldIssue[];

  constructor(code: ErrorCode, message: string, status: number, fields?: FieldIssue[]) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/** Type guard so `catch (e)` blocks can narrow to our error and read `.code`. */
export function isApiRequestError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError;
}

/**
 * Turn a non-2xx response's status + parsed body into an ApiRequestError. Pure and
 * defensive: if the body isn't the canonical `{ error: {...} }` shape (e.g. a proxy
 * returned HTML, or the network layer produced something odd), fall back to an
 * INTERNAL error so the app still surfaces one consistent failure instead of crashing.
 */
export function toApiRequestError(status: number, body: unknown): ApiRequestError {
  const error = (body as { error?: Partial<ApiError> } | null)?.error;
  const knownCodes = Object.values(ERROR_CODES) as string[];
  const code: ErrorCode =
    error?.code && knownCodes.includes(error.code)
      ? (error.code as ErrorCode)
      : ERROR_CODES.INTERNAL;
  const message =
    typeof error?.message === 'string' && error.message.length > 0
      ? error.message
      : 'Something went wrong.';
  return new ApiRequestError(code, message, status, error?.fields);
}
