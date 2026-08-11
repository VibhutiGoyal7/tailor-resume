// Pure helpers for the Resumes tab (list + detail), kept out of the screens so the
// derivations are unit-testable (ADR-019). The list card's subtitle, the profile
// avatar initials, and the detail screen's per-bullet source grouping are all pure
// functions over the API shapes — no rendering needed to test them.
import type {
  ExperienceItemView,
  RenderedBullet,
  TailoredResumeSummary,
} from '@tailor/shared-types';
import { TEMPLATES } from '@tailor/shared-types';
import { itemCardText } from './bankItem';

/**
 * The Resumes-list card subtitle (screens/tailor_screen_resumes_list.svg):
 * "Fintech startup · Modern two-column" — the parsed company type and the chosen
 * template's display name. Either half is dropped if missing.
 */
export function resumeListSubtitle(
  summary: Pick<TailoredResumeSummary, 'companyType' | 'templateId'>,
): string {
  const template = TEMPLATES[summary.templateId]?.name ?? '';
  return [summary.companyType?.trim(), template].filter(Boolean).join(' · ');
}

/**
 * Initials for the profile avatar (screens/tailor_screen_profile_settings.svg shows
 * "NV" for "Nikhil Verma"): first letters of the first two words, uppercased.
 * Falls back to the first letter of a single word, or '' when there's nothing.
 */
export function initialsFromName(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
}

/** One grouped section of tailored bullets on the resume-detail screen. */
export interface ResumeBulletGroup {
  /** Stable key + section heading (EXPERIENCE / PROJECTS / EDUCATION). */
  key: string;
  label: string;
  bullets: { text: string; source: string }[];
}

// The detail screen's bullet-section headings, in display order. `experience`,
// `projects`, and `education` are the first-class bullet sections of the content
// model (RenderedBullet.section / RESUME_SECTIONS); `types` is the fallback mapping
// for legacy resumes generated before `section` was persisted.
const SECTIONS: { key: string; label: string; types: string[] }[] = [
  { key: 'experience', label: 'EXPERIENCE', types: ['role'] },
  { key: 'projects', label: 'PROJECTS', types: ['project'] },
  { key: 'education', label: 'EDUCATION', types: ['education'] },
];

/**
 * Group a resume's rendered bullets into display sections, attaching a human
 * "from: …" source label (screens/tailor_screen_resume_detail.svg). A bullet's
 * section comes from its persisted `section` field; for legacy resumes without one
 * it falls back to the kind of the Experience item it traces to. Bullets whose
 * source item can't be resolved (e.g. it was deleted) keep a generic source label.
 * Only non-empty sections are returned, in EXPERIENCE → PROJECTS → EDUCATION order.
 */
export function groupResumeBullets(
  bullets: RenderedBullet[],
  itemsById: Map<string, ExperienceItemView>,
): ResumeBulletGroup[] {
  const byKey = new Map<string, ResumeBulletGroup>();
  for (const section of SECTIONS) {
    byKey.set(section.key, { key: section.key, label: section.label, bullets: [] });
  }
  const keyForType = (type: string | undefined): string =>
    SECTIONS.find((s) => type && s.types.includes(type))?.key ?? 'experience';

  for (const bullet of bullets) {
    const item = itemsById.get(bullet.experienceItemId);
    const source = item ? itemCardText(item).title : 'your experience bank';
    const key = bullet.section ?? keyForType(item?.type);
    byKey.get(key)!.bullets.push({ text: bullet.text, source });
  }

  return SECTIONS.map((s) => byKey.get(s.key)!).filter((g) => g.bullets.length > 0);
}

/** Flatten the grouped bank view into an itemId → item lookup for source tracing. */
export function indexBankItems(
  bank: Record<string, ExperienceItemView[]> | undefined,
): Map<string, ExperienceItemView> {
  const map = new Map<string, ExperienceItemView>();
  if (!bank) return map;
  for (const list of Object.values(bank)) {
    for (const item of list) map.set(item.id, item);
  }
  return map;
}
