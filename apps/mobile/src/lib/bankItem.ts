// Display helpers for Experience Bank items. structuredFields is a free-form
// Record<string, unknown>, so these turn a saved item into the title/subtitle the
// bank list and item-detail screens show (screens/tailor_screen_bank_list.svg,
// tailor_screen_item_detail.svg). Pure, so the derivation is unit-tested without
// rendering. The field keys here are the same ones the add-item forms write.
import type { ExperienceItemView, ExperienceType } from '@tailor/shared-types';

/** Section order + labels for the grouped bank list (roles first, skills last). */
export const BANK_SECTIONS: { type: ExperienceType; label: string; singular: string }[] = [
  { type: 'role', label: 'ROLES', singular: 'role' },
  { type: 'project', label: 'PROJECTS', singular: 'project' },
  { type: 'education', label: 'EDUCATION', singular: 'education' },
  { type: 'skill', label: 'SKILLS', singular: 'skill' },
];

type Fields = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const join = (parts: string[], sep: string): string => parts.filter(Boolean).join(sep);

/** One-line title + subtitle for a bank *list* card (skills render as chips). */
export function itemCardText(item: ExperienceItemView): { title: string; subtitle: string } {
  const f = item.structuredFields as Fields;
  switch (item.type) {
    case 'role':
      return {
        title: join([s(f.title), s(f.company)], ', ') || 'Untitled role',
        subtitle: join([s(f.startDate), s(f.endDate)], ' — '),
      };
    case 'project':
      return {
        title: s(f.name) || 'Untitled project',
        subtitle: join([s(f.context), s(f.timeframe)], ' · '),
      };
    case 'education':
      return {
        title: join([s(f.degree), s(f.field)], ', ') || s(f.school) || 'Education',
        subtitle: join([s(f.startYear), s(f.endYear)], ' — '),
      };
    case 'skill':
      return { title: s(f.name) || 'Skill', subtitle: s(f.category) };
  }
}

/** The chip label a skill shows in the bank list's SKILLS section. */
export function skillLabel(item: ExperienceItemView): string {
  return s((item.structuredFields as Fields).name) || 'Skill';
}

/** Fuller title + subtitle for the item-detail header. */
export function itemDetailText(item: ExperienceItemView): { title: string; subtitle: string } {
  const f = item.structuredFields as Fields;
  const range = (a: unknown, b: unknown) => join([s(a), s(b)], ' — ');
  switch (item.type) {
    case 'role':
      return {
        title: s(f.title) || 'Role',
        subtitle: join([s(f.company), range(f.startDate, f.endDate), s(f.location)], ' · '),
      };
    case 'project':
      return {
        title: s(f.name) || 'Project',
        subtitle: join([s(f.context), s(f.timeframe)], ' · '),
      };
    case 'education':
      return {
        title: join([s(f.degree), s(f.field)], ', ') || s(f.school) || 'Education',
        subtitle: join([s(f.school), range(f.startYear, f.endYear)], ' · '),
      };
    case 'skill':
      return { title: s(f.name) || 'Skill', subtitle: join([s(f.category), s(f.usage)], ' · ') };
  }
}
