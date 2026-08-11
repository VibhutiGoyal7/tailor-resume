import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_VARIANT,
  DEFAULT_TEMPLATE_ID,
  isValidLayoutVariant,
  LAYOUT_VARIANTS,
  resolveSectionOrder,
  RESUME_SECTIONS,
  suggestTemplateId,
  TEMPLATE_IDS,
  TEMPLATES,
  updateResumeLayoutSchema,
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

describe('layout customization contracts (Milestone 7)', () => {
  it('resolveSectionOrder fills an empty/partial order to the full default set', () => {
    expect(resolveSectionOrder([])).toEqual([
      'summary',
      'skills',
      'experience',
      'projects',
      'education',
    ]);
    // Keeps given order, appends missing in default position, drops unknowns.
    expect(resolveSectionOrder(['experience', 'bogus'])).toEqual([
      'experience',
      'summary',
      'skills',
      'projects',
      'education',
    ]);
    // The result is always a permutation of the known sections.
    expect(resolveSectionOrder(['skills']).sort()).toEqual([...RESUME_SECTIONS].sort());
  });

  it('every template has at least one variant, with a valid default', () => {
    for (const id of TEMPLATE_IDS) {
      expect(LAYOUT_VARIANTS[id].length).toBeGreaterThan(0);
      expect(isValidLayoutVariant(id, DEFAULT_LAYOUT_VARIANT[id])).toBe(true);
    }
    // A variant is not valid across templates.
    expect(isValidLayoutVariant('ats', 'modern-right')).toBe(false);
    expect(isValidLayoutVariant('modern', 'modern-right')).toBe(true);
  });

  it('updateResumeLayoutSchema accepts partial updates and rejects bad input', () => {
    expect(updateResumeLayoutSchema.parse({ hiddenSections: ['skills'] })).toEqual({
      hiddenSections: ['skills'],
    });
    // Unknown section value.
    expect(updateResumeLayoutSchema.safeParse({ sectionOrder: ['nope'] }).success).toBe(false);
    // Duplicate sections rejected by the refinement.
    expect(
      updateResumeLayoutSchema.safeParse({ sectionOrder: ['summary', 'summary'] }).success,
    ).toBe(false);
    // Unknown template id.
    expect(updateResumeLayoutSchema.safeParse({ templateId: 'fancy' }).success).toBe(false);
  });
});
