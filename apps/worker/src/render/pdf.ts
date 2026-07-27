// PDF rendering via @react-pdf/renderer (ADR-012). Built with React.createElement
// (no JSX) so the worker's plain tsc build needs no JSX config. Three templates
// (ADR-018) share TEMPLATE_CONFIG; `modern` is two-column, the others single.
import { createElement as h } from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { RenderInput } from '@tailor/modules';
import { contactLine, TEMPLATE_CONFIG, TOKENS } from './templates.js';

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

  const experienceEl = h(
    View,
    { style: s.section },
    headingEl('Experience'),
    ...input.content.bullets.map((b, i) =>
      h(
        View,
        { style: s.bullet, key: `b${i}` },
        h(Text, { style: s.bulletDot }, '•'),
        h(Text, { style: s.bulletText }, b.text),
      ),
    ),
  );

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

  let body;
  if (cfg.layout === 'two-column') {
    // Sidebar (contact + skills) alongside a main column (name, summary, experience).
    body = h(
      View,
      { style: s.row },
      h(View, { style: s.sidebar }, contactEl, skillsEl),
      h(View, { style: s.main }, nameEl, summaryEl, experienceEl),
    );
  } else {
    body = h(
      View,
      {},
      nameEl,
      contactEl,
      h(View, { style: s.rule }),
      summaryEl,
      experienceEl,
      skillsEl,
    );
  }

  return h(Document, {}, h(Page, { size: 'A4', style: s.page }, body));
}

/** Render a resume to a PDF buffer. */
export async function renderPdf(input: RenderInput): Promise<Buffer> {
  return renderToBuffer(buildDocument(input));
}
