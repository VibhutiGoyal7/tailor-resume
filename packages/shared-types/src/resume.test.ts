import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE_ID,
  suggestTemplateId,
  TEMPLATE_IDS,
  TEMPLATES,
  type JdParsed,
} from './index.js';

const jd = (company_type: string): Pick<JdParsed, 'company_type'> => ({ company_type });

describe('TEMPLATES registry', () => {
  it('has an entry for every template id, and the default is a real id', () => {
    for (const id of TEMPLATE_IDS) {
      expect(TEMPLATES[id].id).toBe(id);
      expect(TEMPLATES[id].name.length).toBeGreaterThan(0);
    }
    expect(TEMPLATE_IDS).toContain(DEFAULT_TEMPLATE_ID);
  });
});

describe('suggestTemplateId (ADR-012 rule-based)', () => {
  it('maps startup / scale-up to the modern two-column template', () => {
    expect(suggestTemplateId(jd('Startup'))).toBe('modern');
    expect(suggestTemplateId(jd('scale-up'))).toBe('modern');
    expect(suggestTemplateId(jd('Seed-stage'))).toBe('modern');
  });

  it('maps enterprise / corporate / government to ATS-safe', () => {
    expect(suggestTemplateId(jd('Enterprise'))).toBe('ats');
    expect(suggestTemplateId(jd('Large corporate bank'))).toBe('ats');
    expect(suggestTemplateId(jd('Government agency'))).toBe('ats');
  });

  it('falls back to the default for anything unrecognized', () => {
    expect(suggestTemplateId(jd('Nonprofit'))).toBe(DEFAULT_TEMPLATE_ID);
    expect(suggestTemplateId(jd(''))).toBe(DEFAULT_TEMPLATE_ID);
  });
});
