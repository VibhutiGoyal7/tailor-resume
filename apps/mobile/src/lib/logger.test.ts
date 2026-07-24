import { describe, expect, it } from 'vitest';
import { buildLogEntry, shouldLog } from './logger.js';

describe('buildLogEntry', () => {
  it('builds a structured entry with level and message', () => {
    expect(buildLogEntry('info', 'navigated to tailoring flow')).toEqual({
      level: 'info',
      message: 'navigated to tailoring flow',
    });
  });

  it('includes context when provided', () => {
    expect(
      buildLogEntry('error', 'api call failed', { status: 500, route: '/api/resumes' }),
    ).toEqual({
      level: 'error',
      message: 'api call failed',
      context: { status: 500, route: '/api/resumes' },
    });
  });

  it('omits context when empty', () => {
    expect('context' in buildLogEntry('debug', 'x', {})).toBe(false);
  });
});

describe('shouldLog', () => {
  it('emits at or above the minimum level', () => {
    expect(shouldLog('error', 'warn')).toBe(true);
    expect(shouldLog('warn', 'warn')).toBe(true);
  });

  it('suppresses below the minimum level', () => {
    expect(shouldLog('debug', 'info')).toBe(false);
    expect(shouldLog('info', 'warn')).toBe(false);
  });
});
