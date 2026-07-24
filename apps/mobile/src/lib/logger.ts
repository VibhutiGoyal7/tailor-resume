// The ONE logging entry point for the mobile app (CLAUDE.md Section 3).
// Screens/components must never call console.* directly — route everything
// through this so log shipping can later be swapped in at a single place.
// Today it wraps console; the structured entry shape is what matters.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Build the structured log record. Pure — no I/O — so it can be unit-tested and
 * later handed to a real log shipper unchanged. `context` is omitted entirely
 * when empty so entries stay compact.
 */
export function buildLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): LogEntry {
  const entry: LogEntry = { level, message };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  return entry;
}

/** Whether an entry at `level` should be emitted given the configured minimum. */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function createLogger(minLevel: LogLevel = 'debug') {
  function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(level, minLevel)) return;
    const entry = buildLogEntry(level, message, context);
    // Single sink today — replace this line to ship logs elsewhere.
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
  }

  return {
    debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
    info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
    warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
    error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
  };
}

export const logger = createLogger();
