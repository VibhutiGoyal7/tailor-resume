import { describe, expect, it } from 'vitest';
import type { BulletVectorMatch, JdParsed } from '@tailor/shared-types';
import { buildRetrievalQueries, rerankCandidates, MAX_CANDIDATES } from './retrieval.js';

const jd: JdParsed = {
  required_skills: ['Go', ' Kubernetes ', 'Go'],
  role_type: 'x',
  seniority: 'y',
  company_type: 'z',
  key_responsibilities: ['Own CI/CD', '', ' Own CI/CD '],
};

describe('buildRetrievalQueries', () => {
  it('unions responsibilities + skills, trims, dedupes, drops blanks', () => {
    expect(buildRetrievalQueries(jd)).toEqual(['Own CI/CD', 'Go', 'Kubernetes']);
  });
});

function match(id: string, distance: number, tags: string[]): BulletVectorMatch {
  return { bulletId: id, experienceItemId: 'i', text: `bullet ${id}`, tags, distance };
}

describe('rerankCandidates', () => {
  it('keeps each bullet’s best distance across queries', () => {
    const ranked = rerankCandidates([match('a', 0.8, []), match('a', 0.2, [])], []);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.score).toBeCloseTo(0.8, 5); // 1 - 0.2
  });

  it('boosts bullets whose tags match a required skill (exact, case-insensitive)', () => {
    const ranked = rerankCandidates(
      [match('plain', 0.3, ['Writing']), match('tagged', 0.3, ['go'])],
      ['Go'],
    );
    // Same semantic distance; the tag-matched bullet ranks first via the boost.
    expect(ranked[0]!.bulletId).toBe('tagged');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('caps the tag boost and the candidate count', () => {
    const many = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) =>
      match(`b${i}`, 0.5, i % 2 ? ['Go'] : []),
    );
    const ranked = rerankCandidates(many, ['Go']);
    expect(ranked.length).toBe(MAX_CANDIDATES);
    // Boost caps at MAX_TAG_BOOST (0.3): a single-tag hit adds 0.15, so max score
    // here is (1 - 0.5) + 0.15 = 0.65.
    expect(ranked[0]!.score).toBeLessThanOrEqual(0.65 + 1e-9);
  });
});
