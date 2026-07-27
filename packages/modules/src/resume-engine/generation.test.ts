import { describe, expect, it } from 'vitest';
import type { GeneratedResume, JdParsed, RetrievedCandidateView } from '@tailor/shared-types';
import type { GenerationCandidate } from './generator.js';
import {
  buildGenerationInput,
  MAX_GENERATED_BULLETS,
  reconcileGeneratedResume,
  selectKeptCandidates,
} from './generation.js';

const JD: JdParsed = {
  required_skills: ['Go', 'Kubernetes'],
  role_type: 'Platform Engineer',
  seniority: 'Senior',
  company_type: 'Scale-up',
  key_responsibilities: ['Own the CI/CD platform'],
};

const retrieved: RetrievedCandidateView[] = [
  {
    bulletId: 'b1',
    experienceItemId: 'i1',
    text: 'Built CI/CD on k8s',
    tags: ['Kubernetes'],
    score: 1,
  },
  { bulletId: 'b2', experienceItemId: 'i1', text: 'Wrote Go services', tags: ['Go'], score: 0.9 },
  { bulletId: 'b3', experienceItemId: 'i2', text: 'Unrelated copy', tags: [], score: 0.2 },
];

describe('selectKeptCandidates', () => {
  it('keeps only kept ids, preserving retrieved order', () => {
    const kept = selectKeptCandidates(retrieved, ['b3', 'b1']);
    expect(kept.map((c) => c.bulletId)).toEqual(['b1', 'b3']);
    expect(kept[0]).toMatchObject({ experienceItemId: 'i1', text: 'Built CI/CD on k8s' });
  });

  it('ignores ids not present in the retrieved snapshot', () => {
    expect(selectKeptCandidates(retrieved, ['nope']).length).toBe(0);
  });
});

describe('buildGenerationInput', () => {
  it('assembles the JD, candidates, template limit, and basics', () => {
    const candidates = selectKeptCandidates(retrieved, ['b1']);
    const input = buildGenerationInput(JD, candidates, { fullName: 'Ada' });
    expect(input.jdParsed).toBe(JD);
    expect(input.candidates).toBe(candidates);
    expect(input.maxBullets).toBe(MAX_GENERATED_BULLETS);
    expect(input.basics).toEqual({ fullName: 'Ada' });
  });

  it('defaults basics to null when omitted', () => {
    expect(buildGenerationInput(JD, []).basics).toBeNull();
  });
});

describe('reconcileGeneratedResume', () => {
  const candidates: GenerationCandidate[] = selectKeptCandidates(retrieved, ['b1', 'b2']);

  it('attaches experienceItemId, trims text, and sets templateId', () => {
    const generated: GeneratedResume = {
      summary: '  A tailored summary.  ',
      bullets: [{ sourceBulletId: 'b1', text: '  Led the platform build.  ' }],
    };
    const rendered = reconcileGeneratedResume(generated, candidates, 'ats', undefined, [
      'Go',
      'Kubernetes',
    ]);
    expect(rendered.summary).toBe('A tailored summary.');
    expect(rendered.templateId).toBe('ats');
    expect(rendered.bullets).toEqual([
      { sourceBulletId: 'b1', experienceItemId: 'i1', text: 'Led the platform build.' },
    ]);
    // Skills are carried into the rendered content for later re-render (M7).
    expect(rendered.skills).toEqual(['Go', 'Kubernetes']);
  });

  it('drops hallucinated source ids and blank rewrites', () => {
    const generated: GeneratedResume = {
      summary: 's',
      bullets: [
        { sourceBulletId: 'ghost', text: 'Invented.' },
        { sourceBulletId: 'b2', text: '   ' },
        { sourceBulletId: 'b1', text: 'Real.' },
      ],
    };
    const rendered = reconcileGeneratedResume(generated, candidates, 'classic');
    expect(rendered.bullets.map((b) => b.sourceBulletId)).toEqual(['b1']);
  });

  it('dedupes by source bullet, keeping the first rewrite', () => {
    const generated: GeneratedResume = {
      summary: 's',
      bullets: [
        { sourceBulletId: 'b1', text: 'First.' },
        { sourceBulletId: 'b1', text: 'Duplicate.' },
      ],
    };
    const rendered = reconcileGeneratedResume(generated, candidates, 'classic');
    expect(rendered.bullets).toHaveLength(1);
    expect(rendered.bullets[0]!.text).toBe('First.');
  });

  it('caps at maxBullets', () => {
    const many: GenerationCandidate[] = Array.from({ length: 5 }, (_, i) => ({
      bulletId: `k${i}`,
      experienceItemId: 'i',
      text: `t${i}`,
      tags: [],
    }));
    const generated: GeneratedResume = {
      summary: 's',
      bullets: many.map((c) => ({ sourceBulletId: c.bulletId, text: `rewrite ${c.bulletId}` })),
    };
    const rendered = reconcileGeneratedResume(generated, many, 'classic', 2);
    expect(rendered.bullets).toHaveLength(2);
  });
});
