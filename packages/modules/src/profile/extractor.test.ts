import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@tailor/shared-types';
import { MAX_EXTRACTED_BULLETS, StubBankExtractor, normalizeExtraction } from './extractor.js';

const EMPTY_FIELDS = {
  title: null,
  company: null,
  startDate: null,
  endDate: null,
  location: null,
  name: null,
  context: null,
  timeframe: null,
  school: null,
  degree: null,
  field: null,
  startYear: null,
  endYear: null,
  category: null,
} as ExtractionResult['structuredFields'];

const result = (over: Partial<ExtractionResult>): ExtractionResult => ({
  type: 'role',
  structuredFields: EMPTY_FIELDS,
  bullets: [],
  ...over,
});

describe('normalizeExtraction', () => {
  it('trims, drops blanks, and dedupes bullets (case-insensitive)', () => {
    const out = normalizeExtraction(
      result({
        bullets: [
          { text: '  Led the migration  ', impactMetric: null, tags: [] },
          { text: 'led the migration', impactMetric: null, tags: [] }, // dup
          { text: '   ', impactMetric: null, tags: [] }, // blank
          { text: 'Owned CI/CD', impactMetric: '  ', tags: ['ci', 'ci', ' cd '] },
        ],
      }),
    );
    expect(out.bullets).toHaveLength(2);
    expect(out.bullets[0]).toEqual({ text: 'Led the migration', impactMetric: null, tags: [] });
    expect(out.bullets[1]).toEqual({ text: 'Owned CI/CD', impactMetric: null, tags: ['ci', 'cd'] });
  });

  it('caps the number of bullets', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      text: `Bullet ${i}`,
      impactMetric: null,
      tags: [],
    }));
    expect(normalizeExtraction(result({ bullets: many })).bullets).toHaveLength(
      MAX_EXTRACTED_BULLETS,
    );
  });

  it('nulls blank structured fields and keeps real ones', () => {
    const out = normalizeExtraction(
      result({
        structuredFields: { ...EMPTY_FIELDS, title: '  Senior Engineer ', company: '   ' },
      }),
    );
    expect(out.structuredFields.title).toBe('Senior Engineer');
    expect(out.structuredFields.company).toBeNull();
  });

  it('honors the type hint over the model-returned type', () => {
    expect(normalizeExtraction(result({ type: 'project' }), 'skill').type).toBe('skill');
    expect(normalizeExtraction(result({ type: 'project' })).type).toBe('project');
  });
});

describe('StubBankExtractor', () => {
  it('produces bullets from sentences and echoes the type hint', async () => {
    const out = await new StubBankExtractor().extract({
      text: 'I led the checkout migration. I owned the mobile CI/CD pipeline.',
      typeHint: 'role',
    });
    expect(out.type).toBe('role');
    expect(out.bullets.length).toBeGreaterThan(0);
    expect(out.bullets.length).toBeLessThanOrEqual(MAX_EXTRACTED_BULLETS);
  });

  it('always returns at least one bullet, even for terse text', async () => {
    const out = await new StubBankExtractor().extract({ text: 'React Native', typeHint: 'skill' });
    expect(out.bullets.length).toBeGreaterThanOrEqual(1);
    expect(out.type).toBe('skill');
  });
});
