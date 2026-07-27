// The ONE error shape used by every non-2xx API response (build brief Section 5,
// CLAUDE.md Section 4). Do not invent per-route error shapes — extend this instead.

/** Stable, machine-readable error codes the client can switch on. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Per-field detail attached to validation (400) errors. */
export interface FieldIssue {
  field: string;
  issue: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Present only on validation errors. */
  fields?: FieldIssue[];
}

/** The full JSON body of any non-2xx response: `{ error: { ... } }`. */
export interface ApiErrorBody {
  error: ApiError;
}

/**
 * Build the canonical error body. `fields` is only included when it's a
 * non-empty array, so success/other responses never carry an empty `fields` key.
 */
export function makeError(code: ErrorCode, message: string, fields?: FieldIssue[]): ApiErrorBody {
  const error: ApiError = { code, message };
  if (fields && fields.length > 0) {
    error.fields = fields;
  }
  return { error };
}

/** Convenience for the common 400 case. */
export function validationError(
  fields: FieldIssue[],
  message = 'Validation failed.',
): ApiErrorBody {
  return makeError(ERROR_CODES.VALIDATION_FAILED, message, fields);
}

/** Map each error code to its default HTTP status. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Application error carrying a stable `code`, an HTTP `status`, and optional
 * per-field detail. Thrown by module facades; the web layer's single error
 * handler catches it and serializes via `toBody()` into the canonical shape,
 * so no route hand-rolls error JSON (CLAUDE.md Section 4).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldIssue[];

  constructor(code: ErrorCode, message: string, fields?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (fields && fields.length > 0) this.fields = fields;
  }

  toBody(): ApiErrorBody {
    return makeError(this.code, this.message, this.fields);
  }
}

/** Type guard for narrowing an unknown parsed response into an ApiErrorBody. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const maybe = value as { error?: unknown };
  if (typeof maybe.error !== 'object' || maybe.error === null) return false;
  const err = maybe.error as { code?: unknown; message?: unknown };
  return typeof err.code === 'string' && typeof err.message === 'string';
}
