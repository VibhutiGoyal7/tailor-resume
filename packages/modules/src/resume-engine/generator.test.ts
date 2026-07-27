import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JdParsed } from '@tailor/shared-types';
import {
  AnthropicResumeGenerator,
  getResumeGenerator,
  setResumeGenerator,
  StubResumeGenerator,
  type GenerationInput,
  type ResumeGenerator,
} from './generator.js';

const JD: JdParsed = {
  required_skills: ['Go', 'Kubernetes'],
  role_type: 'Platform Engineer',
  seniority: 'Senior',
  company_type: 'Scale-up',
  key_responsibilities: ['Own the CI/CD platform'],
};

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    jdParsed: JD,
    candidates: [
      { bulletId: 'b1', experienceItemId: 'i1', text: 'Built CI/CD on k8s', tags: ['Kubernetes'] },
      { bulletId: 'b2', experienceItemId: 'i1', text: 'Wrote Go services', tags: ['Go'] },
    ],
    maxBullets: 12,
    basics: null,
    ...overrides,
  };
}

describe('StubResumeGenerator', () => {
  it('grounds each bullet on its own candidate id and honors maxBullets', async () => {
    const result = await new StubResumeGenerator().generate(input({ maxBullets: 1 }));
    expect(result.bullets).toHaveLength(1);
    expect(result.bullets[0]!.sourceBulletId).toBe('b1');
    expect(result.summary.length).toBeGreaterThan(0);
    // Faithful: stub echoes the source text (never invents).
    expect(result.bullets[0]!.text).toBe('Built CI/CD on k8s');
  });

  it('produces a summary even with no candidates', async () => {
    const result = await new StubResumeGenerator().generate(input({ candidates: [] }));
    expect(result.bullets).toEqual([]);
    expect(result.summary).toContain('Platform Engineer');
  });
});

describe('getResumeGenerator default selection', () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    setResumeGenerator(undefined as unknown as ResumeGenerator);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
    setResumeGenerator(undefined as unknown as ResumeGenerator);
  });

  it('falls back to StubResumeGenerator when no ANTHROPIC_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getResumeGenerator()).toBeInstanceOf(StubResumeGenerator);
  });

  it('uses AnthropicResumeGenerator when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
    expect(getResumeGenerator()).toBeInstanceOf(AnthropicResumeGenerator);
  });
});

describe('generator injection', () => {
  it('uses an injected fake generator (no network)', async () => {
    const fake: ResumeGenerator = {
      generate: async () => ({ summary: 'x', bullets: [] }),
    };
    setResumeGenerator(fake);
    expect(getResumeGenerator()).toBe(fake);
    await expect(getResumeGenerator().generate(input())).resolves.toMatchObject({ summary: 'x' });
  });
});
