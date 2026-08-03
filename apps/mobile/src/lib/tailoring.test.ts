import { describe, expect, it } from 'vitest';
import {
  GENERATE_STEPS,
  RETRIEVE_STEPS,
  isPhaseComplete,
  matchLabel,
  stepStates,
} from './tailoring';

describe('stepStates — retrieve phase', () => {
  it('reading is active while parsing', () => {
    expect(stepStates('retrieve', 'parsing')).toEqual(['active', 'pending', 'pending']);
  });
  it('finding is active while retrieving', () => {
    expect(stepStates('retrieve', 'retrieving')).toEqual(['done', 'active', 'pending']);
  });
  it('ready is active at the checkpoint', () => {
    expect(stepStates('retrieve', 'awaiting_confirmation')).toEqual(['done', 'done', 'active']);
  });
  it('all done once past the checkpoint', () => {
    expect(stepStates('retrieve', 'generating')).toEqual(['done', 'done', 'done']);
  });
  it('has three steps', () => {
    expect(RETRIEVE_STEPS).toHaveLength(3);
  });
});

describe('stepStates — generate phase', () => {
  it('writing is active while generating (first two already behind us)', () => {
    expect(stepStates('generate', 'generating')).toEqual(['done', 'done', 'active', 'pending']);
  });
  it('every step done once the job is done', () => {
    expect(stepStates('generate', 'done')).toEqual(['done', 'done', 'done', 'done']);
  });
  it('has four steps', () => {
    expect(GENERATE_STEPS).toHaveLength(4);
  });
});

describe('isPhaseComplete', () => {
  it('retrieve completes at awaiting_confirmation', () => {
    expect(isPhaseComplete('retrieve', 'retrieving')).toBe(false);
    expect(isPhaseComplete('retrieve', 'awaiting_confirmation')).toBe(true);
    expect(isPhaseComplete('retrieve', 'done')).toBe(true);
  });
  it('generate completes only at done', () => {
    expect(isPhaseComplete('generate', 'generating')).toBe(false);
    expect(isPhaseComplete('generate', 'done')).toBe(true);
  });
});

describe('matchLabel', () => {
  it('bands scores into friendly labels', () => {
    expect(matchLabel(92)).toBe('Great match');
    expect(matchLabel(85)).toBe('Great match');
    expect(matchLabel(70)).toBe('Strong match');
    expect(matchLabel(55)).toBe('Solid match');
    expect(matchLabel(20)).toBe('Partial match');
  });
  it('falls back for a null score', () => {
    expect(matchLabel(null)).toBe('Your match');
  });
});
