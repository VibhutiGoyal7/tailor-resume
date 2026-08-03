import { describe, expect, it } from 'vitest';
import type { ExperienceItemView, ExperienceType } from '@tailor/shared-types';
import { itemCardText, itemDetailText, skillLabel } from './bankItem';

const item = (
  type: ExperienceType,
  structuredFields: Record<string, unknown>,
): ExperienceItemView => ({
  id: 'i1',
  type,
  source: 'structured_form',
  rawInput: '',
  structuredFields,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  bullets: [],
});

describe('itemCardText', () => {
  it('role: "Title, Company" + date range', () => {
    expect(
      itemCardText(
        item('role', {
          title: 'Senior Engineer',
          company: 'Acme Co.',
          startDate: '2021',
          endDate: 'Present',
        }),
      ),
    ).toEqual({ title: 'Senior Engineer, Acme Co.', subtitle: '2021 — Present' });
  });

  it('education: "Degree, Field" + years', () => {
    expect(
      itemCardText(
        item('education', {
          degree: 'B.Tech',
          field: 'Computer Science',
          startYear: '2015',
          endYear: '2019',
        }),
      ),
    ).toEqual({ title: 'B.Tech, Computer Science', subtitle: '2015 — 2019' });
  });

  it('falls back gracefully when fields are missing', () => {
    expect(itemCardText(item('role', {})).title).toBe('Untitled role');
    expect(itemCardText(item('project', {})).title).toBe('Untitled project');
  });
});

describe('skillLabel', () => {
  it('uses the skill name', () => {
    expect(skillLabel(item('skill', { name: 'React Native' }))).toBe('React Native');
  });
});

describe('itemDetailText', () => {
  it('role: title alone, subtitle joins company · dates · location', () => {
    expect(
      itemDetailText(
        item('role', {
          title: 'Senior Engineer',
          company: 'Acme Co.',
          startDate: '2021',
          endDate: 'Present',
          location: 'Remote',
        }),
      ),
    ).toEqual({ title: 'Senior Engineer', subtitle: 'Acme Co. · 2021 — Present · Remote' });
  });

  it('drops empty parts from the subtitle (no dangling separators)', () => {
    expect(itemDetailText(item('project', { name: 'CV pipeline' }))).toEqual({
      title: 'CV pipeline',
      subtitle: '',
    });
  });
});
