// Shared HTTP helpers for API routes: canonical error serialization, JSON body
// parsing + validation, and client-IP extraction. Every route funnels errors
// through `errorResponse` so the wire format stays the single shape defined in
// shared-types (CLAUDE.md Section 4).
import { ZodError, type ZodType } from 'zod';
import { AppError, makeError, validationError, type FieldIssue } from '@tailor/shared-types';

/** Turn any thrown value into the canonical `{ error }` Response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(err.toBody(), { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields: FieldIssue[] = err.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      issue: i.message,
    }));
    return Response.json(validationError(fields), { status: 400 });
  }
  // Unknown/unexpected — never leak internals to the client.
  return Response.json(makeError('INTERNAL', 'Something went wrong. Please try again.'), {
    status: 500,
  });
}

/** Parse a JSON body and validate it against `schema`, or throw (→ 400). */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body must be valid JSON.');
  }
  return schema.parse(raw); // ZodError → handled by errorResponse
}

/** Best-effort client IP for rate-limiting keys (behind a proxy on deploy). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
