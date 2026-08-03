import { describe, expect, it } from 'vitest';
import type { JdParsed, RetrievedCandidateView } from '@tailor/shared-types';
import { computeMatchScore } from './match-score.js';

const jd = (required_skills: string[]): JdParsed => ({
  role_type: 'Engineer',
  seniority: 'senior',
  company_type: 'Startup',
  required_skills,
  key_responsibilities: [],
});

const cand = (score: number, tags: string[], bulletId = `b${score}`): RetrievedCandidateView => ({
  bulletId,
  experienceItemId: 'e1',
  text: 'did a thing',
  tags,
  score,
});

describe('computeMatchScore', () => {
  it('is 0 when nothing was selected', () => {
    expect(computeMatchScore(jd(['react']), [])).toBe(0);
  });

  it('perfect coverage + perfect strength = 100', () => {
    const score = computeMatchScore(jd(['react', 'typescript']), [
      cand(1, ['react']),
      cand(1, ['typescript']),
    ]);
    expect(score).toBe(100);
  });

  it('blends coverage and strength 50/50', () => {
    // 1 of 2 skills covered (coverage 0.5), mean strength 0.5 → 0.5*0.5 + 0.5*0.5 = 0.5
    const score = computeMatchScore(jd(['react', 'go']), [cand(0.5, ['react'])]);
    expect(score).toBe(50);
  });

  it('falls back to strength alone when the JD lists no required skills', () => {
    expect(computeMatchScore(jd([]), [cand(0.8, []), cand(0.6, [])])).toBe(70);
  });

  it('clamps hybrid scores above 1 (tag boost can push score past 1.0)', () => {
    // score 1.3 clamps to 1.0; full coverage → 100, not >100
    expect(computeMatchScore(jd(['react']), [cand(1.3, ['react'])])).toBe(100);
  });

  it('is case-insensitive when matching skills to tags', () => {
    expect(computeMatchScore(jd(['React']), [cand(1, ['react'])])).toBe(100);
  });
});
