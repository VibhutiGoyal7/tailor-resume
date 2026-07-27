// Structured backend logger (CLAUDE.md Section 3): pino, not console.log.
// Shared by server-side code (web routes, worker, modules). Request/job-scoped
// child loggers (`logger.child({ requestId })` / `{ jobId }`) attach correlation
// IDs so one request or tailoring job can be grepped as a single thread.
//
// Log shipping (Axiom/Better Stack vs. platform log viewer) is deferred to the
// deploy milestone; this is the single place to wire it in later.
import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  // Never log secrets/tokens/passwords — redact common sensitive keys defensively.
  redact: {
    paths: ['password', 'newPassword', 'currentPassword', 'token', 'accessToken', 'refreshToken'],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
