// DOCX rendering via the `docx` library (programmatic document generation).
// ADR-012 amendment: the original stack named `docxtemplater`, which fills a
// pre-authored .docx template with placeholder loops — a poor fit for content
// that is fully generated in code across three code-defined layouts (ADR-018),
// and it would require binary .docx template files checked into the repo. `docx`
// builds the document programmatically, mirroring the react-pdf "layout in code"
// model, so PDF and DOCX stay structurally aligned. ADR-012's reasoning is
// unchanged (render server-side in the worker; a dedicated lib per format).
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx';
import type { RenderInput } from '@tailor/modules';
import { contactLine, TEMPLATE_CONFIG, TOKENS } from './templates.js';

const ACCENT = TOKENS.accent.replace('#', '');
const INK = TOKENS.ink.replace('#', '');
const MUTED = TOKENS.textSecondary.replace('#', '');

/** docx font sizes are in half-points; spacing is in twips (1pt = 20 twips). */
const hp = (pt: number) => Math.round(pt * 2);
const tw = (pt: number) => Math.round(pt * 20);

export async function renderDocx(input: RenderInput): Promise<Buffer> {
  const cfg = TEMPLATE_CONFIG[input.templateId];

  const heading = (label: string) =>
    new Paragraph({
      spacing: { before: tw(cfg.sectionGapPt), after: tw(4) },
      children: [
        new TextRun({
          text: label.toUpperCase(),
          bold: true,
          color: ACCENT,
          size: hp(cfg.headingPt),
        }),
      ],
    });

  const body = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, color: INK, size: hp(cfg.bodyPt) })] });

  const bullet = (text: string) =>
    new Paragraph({
      spacing: { after: tw(cfg.bulletGapPt) },
      children: [new TextRun({ text: `•  ${text}`, color: INK, size: hp(cfg.bodyPt) })],
    });

  const name = new Paragraph({
    children: [
      new TextRun({
        text: input.basics.fullName || 'Your Name',
        bold: true,
        color: ACCENT,
        size: hp(cfg.namePt),
      }),
    ],
  });
  const contact = new Paragraph({
    spacing: { after: tw(6) },
    children: [
      new TextRun({ text: contactLine(input.basics), color: MUTED, size: hp(cfg.bodyPt - 1.5) }),
    ],
  });

  const summaryBlock = input.content.summary
    ? [heading('Summary'), body(input.content.summary)]
    : [];
  const experienceBlock = [
    heading('Experience'),
    ...input.content.bullets.map((b) => bullet(b.text)),
  ];
  const skillsBlock =
    input.skills.length > 0 ? [heading('Skills'), ...input.skills.map((sk) => body(sk))] : [];

  let children: (Paragraph | Table)[];
  if (cfg.layout === 'two-column') {
    // Sidebar (contact + skills) beside a main column (name, summary, experience),
    // laid out as a single borderless two-cell table.
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
    const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
    children = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...borders, insideHorizontal: noBorder, insideVertical: noBorder },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 32, type: WidthType.PERCENTAGE },
                borders,
                children: [contact, ...skillsBlock],
              }),
              new TableCell({
                width: { size: 68, type: WidthType.PERCENTAGE },
                borders,
                children: [name, ...summaryBlock, ...experienceBlock],
              }),
            ],
          }),
        ],
      }),
    ];
  } else {
    children = [name, contact, ...summaryBlock, ...experienceBlock, ...skillsBlock];
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: tw(cfg.pagePt),
              bottom: tw(cfg.pagePt),
              left: tw(cfg.pagePt),
              right: tw(cfg.pagePt),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
