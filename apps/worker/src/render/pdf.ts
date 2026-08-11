// PDF rendering via @react-pdf/renderer (ADR-012). Built with React.createElement
// (no JSX) so the worker's plain tsc build needs no JSX config. Three templates
// (ADR-018) share TEMPLATE_CONFIG; `modern` is two-column, the others single.
import { createElement as h } from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { RenderInput } from '@tailor/modules';
import type { BulletSection, ResumeSection } from '@tailor/shared-types';
import {
  contactLine,
  sidebarOnRight,
  TEMPLATE_CONFIG,
  TOKENS,
  visibleSections,
} from './templates.js';

/** Build the react-pdf element tree for the given resume + template. */
function buildDocument(input: RenderInput) {
  const cfg = TEMPLATE_CONFIG[input.templateId];
  const s = StyleSheet.create({
    page: {
      padding: cfg.pagePt,
      fontSize: cfg.bodyPt,
      color: TOKENS.ink,
      fontFamily: 'Helvetica',
      lineHeight: 1.35,
    },
    row: { flexDirection: 'row' },
    sidebar: { width: '32%', paddingRight: 16 },
    main: { flex: 1 },
    name: { fontSize: cfg.namePt, color: TOKENS.accent, fontFamily: 'Helvetica-Bold' },
    contact: { fontSize: cfg.bodyPt - 1.5, color: TOKENS.textSecondary, marginTop: 4 },
    heading: {
      fontSize: cfg.headingPt,
      color: TOKENS.accent,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    section: { marginTop: cfg.sectionGapPt },
    bullet: { flexDirection: 'row', marginBottom: cfg.bulletGapPt },
    bulletDot: { width: 10 },
    bulletText: { flex: 1 },
    skill: { marginBottom: 2 },
    rule: {
      borderBottomWidth: 1,
      borderBottomColor: TOKENS.accent,
      marginTop: 6,
      marginBottom: 2,
    },
  });

  const headingEl = (label: string) => h(Text, { style: s.heading }, label);

  const summaryEl = input.content.summary
    ? h(View, { style: s.section }, headingEl('Summary'), h(Text, {}, input.content.summary))
    : null;

  // The three bullet sections (Experience / Projects / Education): each renders the
  // tailored bullets filed under it (legacy bullets with no section → Experience).
  // A section with no bullets renders nothing.
  const bulletSectionEl = (label: string, section: BulletSection, keyPrefix: string) => {
    const items = input.content.bullets.filter((b) => (b.section ?? 'experience') === section);
    if (items.length === 0) return null;
    return h(
      View,
      { style: s.section },
      headingEl(label),
      ...items.map((b, i) =>
        h(
          View,
          { style: s.bullet, key: `${keyPrefix}${i}` },
          h(Text, { style: s.bulletDot }, '•'),
          h(Text, { style: s.bulletText }, b.text),
        ),
      ),
    );
  };
  const experienceEl = bulletSectionEl('Experience', 'experience', 'be');
  const projectsEl = bulletSectionEl('Projects', 'projects', 'bp');
  const educationEl = bulletSectionEl('Education', 'education', 'bd');

  const skillsEl =
    input.skills.length > 0
      ? h(
          View,
          { style: s.section },
          headingEl('Skills'),
          ...input.skills.map((sk, i) => h(Text, { style: s.skill, key: `s${i}` }, sk)),
        )
      : null;

  const nameEl = h(Text, { style: s.name }, input.basics.fullName || 'Your Name');
  const contactEl = h(Text, { style: s.contact }, contactLine(input.basics));

  // Layout customization (Milestone 7): emit sections in the user's order, drop
  // hidden ones. A section that's visible but empty (no summary/skills) still drops.
  const visible = visibleSections(input.sectionOrder, input.hiddenSections);
  const sectionEl: Record<ResumeSection, ReturnType<typeof h> | null> = {
    summary: summaryEl,
    skills: skillsEl,
    experience: experienceEl,
    projects: projectsEl,
    education: educationEl,
  };
  const inOrder = (sections: ResumeSection[]) =>
    sections.map((sec) => sectionEl[sec]).filter((el): el is ReturnType<typeof h> => el !== null);

  let body;
  if (cfg.layout === 'two-column') {
    // Sidebar carries contact + skills; the main column carries name + the other
    // visible sections in order. `modern-right` flips which side the sidebar is on.
    const sidebar = h(
      View,
      { style: s.sidebar },
      contactEl,
      ...(visible.includes('skills') && skillsEl ? [skillsEl] : []),
    );
    const main = h(
      View,
      { style: s.main },
      nameEl,
      ...inOrder(visible.filter((sec) => sec !== 'skills')),
    );
    body = h(
      View,
      { style: s.row },
      ...(sidebarOnRight(input.layoutVariantId) ? [main, sidebar] : [sidebar, main]),
    );
  } else {
    body = h(View, {}, nameEl, contactEl, h(View, { style: s.rule }), ...inOrder(visible));
  }

  return h(Document, {}, h(Page, { size: 'A4', style: s.page }, body));
}

/** Render a resume to a PDF buffer. */
export async function renderPdf(input: RenderInput): Promise<Buffer> {
  return renderToBuffer(buildDocument(input));
}
