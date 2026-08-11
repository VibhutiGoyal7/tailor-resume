import { describe, expect, it } from 'vitest';
import type { ExperienceItemView, RenderedBullet } from '@tailor/shared-types';
import { groupResumeBullets, indexBankItems, initialsFromName, resumeListSubtitle } from './resume';

describe('resumeListSubtitle', () => {
  it('joins company type and template display name', () => {
    expect(resumeListSubtitle({ companyType: 'Fintech startup', templateId: 'modern' })).toBe(
      'Fintech startup · Modern two-column',
    );
    expect(resumeListSubtitle({ companyType: 'Series B startup', templateId: 'ats' })).toBe(
      'Series B startup · Clean / ATS-safe',
    );
  });
  it('drops an empty company type', () => {
    expect(resumeListSubtitle({ companyType: '   ', templateId: 'compact' })).toBe(
      'Compact / dense',
    );
  });
});

describe('initialsFromName', () => {
  it('takes first + last initial', () => {
    expect(initialsFromName('Nikhil Verma')).toBe('NV');
    expect(initialsFromName('  ada  lovelace  ')).toBe('AL');
  });
  it('uses first + last across 3+ words', () => {
    expect(initialsFromName('Mary Jane Watson')).toBe('MW');
  });
  it('handles a single name', () => {
    expect(initialsFromName('Cher')).toBe('C');
  });
  it('is empty for empty/nullish input', () => {
    expect(initialsFromName('')).toBe('');
    expect(initialsFromName(null)).toBe('');
    expect(initialsFromName(undefined)).toBe('');
  });
});

// Minimal item factory for the grouping tests.
function item(
  id: string,
  type: ExperienceItemView['type'],
  fields: Record<string, string>,
): ExperienceItemView {
  return {
    id,
    type,
    source: 'structured_form',
    rawInput: '',
    structuredFields: fields,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    bullets: [],
  };
}
function bullet(
  text: string,
  experienceItemId: string,
  section?: RenderedBullet['section'],
): RenderedBullet {
  return { text, experienceItemId, sourceBulletId: `b-${text}`, section };
}

describe('groupResumeBullets', () => {
  const role = item('r1', 'role', { title: 'Senior Engineer', company: 'Acme Co.' });
  const project = item('p1', 'project', { name: 'On-device CV pipeline' });
  const items = indexBankItems({ role: [role], project: [project], education: [], skill: [] });

  it('splits bullets into EXPERIENCE / PROJECTS by source item type, with source labels', () => {
    const groups = groupResumeBullets(
      [bullet('Led migration', 'r1'), bullet('Owned CI/CD', 'r1'), bullet('Shipped rewrite', 'p1')],
      items,
    );
    expect(groups.map((g) => g.label)).toEqual(['EXPERIENCE', 'PROJECTS']);
    expect(groups[0]!.bullets).toEqual([
      { text: 'Led migration', source: 'Senior Engineer, Acme Co.' },
      { text: 'Owned CI/CD', source: 'Senior Engineer, Acme Co.' },
    ]);
    expect(groups[1]!.bullets).toEqual([
      { text: 'Shipped rewrite', source: 'On-device CV pipeline' },
    ]);
  });

  it('uses the persisted section field when present, over the source item type', () => {
    // A bullet whose source item is a role but which was filed under projects.
    const groups = groupResumeBullets([bullet('Filed as project', 'r1', 'projects')], items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('PROJECTS');
    // Source label still comes from the resolved item.
    expect(groups[0]!.bullets[0]!.source).toBe('Senior Engineer, Acme Co.');
  });

  it('folds bullets with an unresolved source into EXPERIENCE with a generic label', () => {
    const groups = groupResumeBullets([bullet('Orphan bullet', 'gone')], items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('EXPERIENCE');
    expect(groups[0]!.bullets[0]!.source).toBe('your experience bank');
  });

  it('returns no groups for no bullets', () => {
    expect(groupResumeBullets([], items)).toEqual([]);
  });
});

describe('indexBankItems', () => {
  it('flattens grouped items into an id lookup', () => {
    const role = item('r1', 'role', { title: 'Eng' });
    const map = indexBankItems({ role: [role], project: [], education: [], skill: [] });
    expect(map.get('r1')).toBe(role);
    expect(map.size).toBe(1);
  });
  it('is empty for undefined', () => {
    expect(indexBankItems(undefined).size).toBe(0);
  });
});
