import { describe, expect, it } from 'vitest';
import { isActive, isTerminal, nextStage } from './stage.js';

describe('nextStage', () => {
  it('advances parsing -> retrieving', () => {
    expect(nextStage('parsing')).toBe('retrieving');
  });

  it('advances retrieving -> awaiting_confirmation', () => {
    expect(nextStage('retrieving')).toBe('awaiting_confirmation');
  });

  it('stops at awaiting_confirmation (ADR-017 two-phase checkpoint)', () => {
    // The worker must NOT auto-advance to generating; only POST /confirm does.
    expect(nextStage('awaiting_confirmation')).toBeNull();
  });

  it('advances generating -> done', () => {
    expect(nextStage('generating')).toBe('done');
  });

  it.each(['done', 'failed'] as const)('has no successor for terminal stage %s', (stage) => {
    expect(nextStage(stage)).toBeNull();
  });
});

describe('isTerminal', () => {
  it('is true only for done and failed', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('parsing')).toBe(false);
    expect(isTerminal('awaiting_confirmation')).toBe(false);
  });
});

describe('isActive', () => {
  it('is true only while the worker is processing', () => {
    expect(isActive('parsing')).toBe(true);
    expect(isActive('retrieving')).toBe(true);
    expect(isActive('generating')).toBe(true);
    expect(isActive('awaiting_confirmation')).toBe(false);
    expect(isActive('done')).toBe(false);
  });
});
