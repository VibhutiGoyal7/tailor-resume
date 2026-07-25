import { describe, expect, it } from 'vitest';
import type { JdParsed } from '@tailor/shared-types';
import { getJdParser, normalizeJdParsed, setJdParser, type JdParser } from './jd-parser.js';

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
