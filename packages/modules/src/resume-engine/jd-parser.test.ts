import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JdParsed } from '@tailor/shared-types';
import {
  AnthropicJdParser,
  getJdParser,
  normalizeJdParsed,
  setJdParser,
  StubJdParser,
  type JdParser,
} from './jd-parser.js';

const sample: JdParsed = {
  required_skills: ['  TypeScript ', 'TypeScript', 'Node.js', '  '],
  role_type: '  Backend Engineer  ',
  seniority: 'Senior ',
  company_type: ' Startup',
  key_responsibilities: ['Build APIs', '', ' Build APIs '],
};

describe('normalizeJdParsed', () => {
  it('trims, drops blanks, and dedupes', () => {
    expect(normalizeJdParsed(sample)).toEqual({
      required_skills: ['TypeScript', 'Node.js'],
      role_type: 'Backend Engineer',
      seniority: 'Senior',
      company_type: 'Startup',
      key_responsibilities: ['Build APIs'],
    });
  });
});

describe('StubJdParser', () => {
  it('returns the canned, normalized JD parse regardless of input', async () => {
    const parser = new StubJdParser();
    const result = await parser.parse('any job description text here');
    expect(result.role_type).toBe('Full-Stack Engineer');
    expect(result.required_skills).toContain('TypeScript');
    expect(result.required_skills.length).toBeGreaterThan(0);
    // Normalized: no blanks, no dupes.
    expect(result.required_skills).toEqual(Array.from(new Set(result.required_skills)));
  });
});

describe('getJdParser default selection', () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    // Force getJdParser to re-evaluate its cached singleton.
    setJdParser(undefined as unknown as JdParser);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
    setJdParser(undefined as unknown as JdParser);
  });

  it('falls back to StubJdParser when no ANTHROPIC_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getJdParser()).toBeInstanceOf(StubJdParser);
  });

  it('uses AnthropicJdParser when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
    expect(getJdParser()).toBeInstanceOf(AnthropicJdParser);
  });
});

describe('parser injection', () => {
  it('uses an injected fake parser (no network)', async () => {
    const fake: JdParser = {
      parse: async (jd) => ({
        required_skills: [jd.slice(0, 3)],
        role_type: 'x',
        seniority: 'y',
        company_type: 'z',
        key_responsibilities: [],
      }),
    };
    setJdParser(fake);
    expect(getJdParser()).toBe(fake);
    await expect(getJdParser().parse('hello')).resolves.toMatchObject({
      required_skills: ['hel'],
    });
  });
});
