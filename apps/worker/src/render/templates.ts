// Per-template render configuration (ADR-018: Clean/ATS-safe, Modern two-column,
// Compact/dense). Shared by both the PDF (react-pdf) and DOCX renderers so the two
// formats of a given template stay visually consistent. Colors are Tailor's locked
// design tokens (build brief §8) — the backend has no shared token module, so they
// are mirrored here with that citation rather than picked ad hoc.
import type { ResumeSection, TemplateId } from '@tailor/shared-types';

/** Design tokens (build brief §8 — dusty denim blue system). */
export const TOKENS = {
  accent: '#2F4858', // headings, name, rules
  ink: '#1D2226', // body text
  textSecondary: '#7B8681', // contact line, muted labels
} as const;

export interface TemplateConfig {
  layout: 'single-column' | 'two-column';
  /** Base body font size in points. */
  bodyPt: number;
  /** Name (header) font size in points. */
  namePt: number;
  /** Section heading font size in points. */
  headingPt: number;
  /** Vertical gap between bullets, in points. */
  bulletGapPt: number;
  /** Vertical gap between sections, in points. */
  sectionGapPt: number;
  /** Page padding, in points. */
  pagePt: number;
}

/** Tuned so the three templates read as genuinely distinct densities/layouts. */
export const TEMPLATE_CONFIG: Record<TemplateId, TemplateConfig> = {
  ats: {
    layout: 'single-column',
    bodyPt: 11,
    namePt: 22,
    headingPt: 12,
    bulletGapPt: 5,
    sectionGapPt: 14,
    pagePt: 44,
  },
  modern: {
    layout: 'two-column',
    bodyPt: 10.5,
    namePt: 21,
    headingPt: 11.5,
    bulletGapPt: 4,
    sectionGapPt: 12,
    pagePt: 36,
  },
  compact: {
    layout: 'single-column',
    bodyPt: 9.5,
    namePt: 18,
    headingPt: 10.5,
    bulletGapPt: 2.5,
    sectionGapPt: 9,
    pagePt: 30,
  },
};

/**
 * The visible body sections in display order (Milestone 7 layout customization):
 * the resolved section order with hidden sections removed. Both renderers walk
 * this list so PDF and DOCX honor reorder/hide identically.
 */
export function visibleSections(
  sectionOrder: ResumeSection[],
  hidden: ResumeSection[],
): ResumeSection[] {
  const hide = new Set(hidden);
  return sectionOrder.filter((s) => !hide.has(s));
}

/** Whether the two-column sidebar sits on the right (the `modern-right` variant). */
export function sidebarOnRight(layoutVariantId: string): boolean {
  return layoutVariantId === 'modern-right';
}

/** Assemble a one-line contact string from the basics (drops empty parts). */
export function contactLine(basics: {
  phone?: string | null;
  location?: string | null;
  links?: { linkedin?: string; portfolio?: string; github?: string };
}): string {
  return [
    basics.location,
    basics.phone,
    basics.links?.linkedin,
    basics.links?.portfolio,
    basics.links?.github,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
    .join('  •  ');
}
