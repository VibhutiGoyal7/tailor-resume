// Renderer tests: exercise the real @react-pdf/renderer and docx libraries (no
// network) and assert each template/format produces a valid file. Cheap magic-byte
// checks — a full layout assertion isn't the point; that a real PDF/DOCX comes out
// of every template is.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION_ORDER, TEMPLATE_IDS, type RenderedResume } from '@tailor/shared-types';
import type { RenderInput } from '@tailor/modules';
import { renderPdf } from './pdf.js';
import { renderDocx } from './docx.js';

const content: RenderedResume = {
  templateId: 'ats',
  summary: 'Senior platform engineer focused on developer experience.',
  bullets: [
    {
      sourceBulletId: 'b1',
      experienceItemId: 'i1',
      text: 'Built the CI/CD platform on Kubernetes.',
    },
    {
      sourceBulletId: 'b2',
      experienceItemId: 'i1',
      text: 'Cut deploy time by 60% with pipeline caching.',
    },
  ],
  skills: ['Kubernetes', 'Go', 'CI/CD'],
};

function input(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    format: 'pdf',
    templateId: 'ats',
    content,
    basics: {
      fullName: 'Ada Lovelace',
      phone: '+1 555 0100',
      location: 'London, UK',
      links: { linkedin: 'linkedin.com/in/ada' },
    },
    skills: ['Kubernetes', 'Go', 'CI/CD'],
    sectionOrder: DEFAULT_SECTION_ORDER,
    hiddenSections: [],
    layoutVariantId: 'ats-standard',
    ...overrides,
  };
}

describe('renderPdf', () => {
  it.each(TEMPLATE_IDS)('produces a valid PDF for the %s template', async (templateId) => {
    const bytes = await renderPdf(input({ format: 'pdf', templateId }));
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('renderDocx', () => {
  it.each(TEMPLATE_IDS)('produces a valid DOCX (zip) for the %s template', async (templateId) => {
    const bytes = await renderDocx(input({ format: 'docx', templateId }));
    expect(bytes.length).toBeGreaterThan(500);
    // DOCX is a zip container — starts with the PK local-file-header signature.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

// Milestone 7: the renderers must honor sectionOrder / hiddenSections / variant.
// Byte-level diffs are a cheap proxy that layout actually changed the output
// (extracting PDF/DOCX text isn't the point — that a change takes effect is).
describe('layout customization (Milestone 7)', () => {
  it('hiding a section produces a different, smaller PDF', async () => {
    const full = await renderPdf(input({ templateId: 'ats' }));
    const hidden = await renderPdf(input({ templateId: 'ats', hiddenSections: ['summary'] }));
    expect(hidden.length).toBeLessThan(full.length);
  });

  it('reordering sections changes the PDF output', async () => {
    const a = await renderPdf(
      input({ templateId: 'ats', sectionOrder: ['summary', 'experience'] }),
    );
    const b = await renderPdf(
      input({ templateId: 'ats', sectionOrder: ['experience', 'summary'] }),
    );
    expect(a.equals(b)).toBe(false);
  });

  it('modern sidebar side (variant) changes the PDF output', async () => {
    const left = await renderPdf(input({ templateId: 'modern', layoutVariantId: 'modern-left' }));
    const right = await renderPdf(input({ templateId: 'modern', layoutVariantId: 'modern-right' }));
    expect(left.equals(right)).toBe(false);
  });

  it('DOCX honors hidden sections too', async () => {
    const full = await renderDocx(input({ format: 'docx', templateId: 'ats' }));
    const hidden = await renderDocx(
      input({ format: 'docx', templateId: 'ats', hiddenSections: ['skills', 'summary'] }),
    );
    expect(hidden.equals(full)).toBe(false);
  });
});
